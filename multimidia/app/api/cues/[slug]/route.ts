import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

import { getVideo } from "@/lib/videos"

const PROJECT_ROOT = path.join(process.cwd(), "..")
const PIPELINE_SCRIPT = path.join(PROJECT_ROOT, "pipeline.py")
const DB_PATH = path.join(PROJECT_ROOT, "fingerprints.db")
const CACHE_DIR = path.join(process.cwd(), ".cue-cache")
const PYTHON = process.env.PYTHON_BIN ?? "python3"

interface PipelineSegment {
  start: number
  end: number
  matched: boolean
  title: string | null
  artist: string | null
  confidence: number | null
}

async function readCache(slug: string): Promise<PipelineSegment[] | null> {
  try {
    const raw = await fs.readFile(path.join(CACHE_DIR, `${slug}.json`), "utf-8")
    return JSON.parse(raw) as PipelineSegment[]
  } catch {
    return null
  }
}

async function writeCache(slug: string, cues: PipelineSegment[]): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true })
  await fs.writeFile(
    path.join(CACHE_DIR, `${slug}.json`),
    JSON.stringify(cues, null, 2),
    "utf-8"
  )
}

function runPipeline(videoPath: string): Promise<PipelineSegment[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      PYTHON,
      [PIPELINE_SCRIPT, "--video", videoPath, "--db", DB_PATH, "--json"],
      { cwd: PROJECT_ROOT }
    )

    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => (stdout += chunk))
    child.stderr.on("data", (chunk) => (stderr += chunk))

    child.on("error", reject)
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `pipeline saiu com codigo ${code}`))
        return
      }
      try {
        resolve(JSON.parse(stdout) as PipelineSegment[])
      } catch {
        reject(new Error(`saida do pipeline nao e um JSON valido:\n${stdout}`))
      }
    })
  })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const video = await getVideo(slug)
  if (!video) {
    return Response.json({ error: "video nao encontrado" }, { status: 404 })
  }

  const force = new URL(request.url).searchParams.get("force") === "1"

  if (!force) {
    const cached = await readCache(slug)
    if (cached) {
      return Response.json({ cues: cached, cached: true })
    }
  }

  const videoPath = path.join(process.cwd(), "public", "videos", video.file)

  try {
    const cues = await runPipeline(videoPath)
    await writeCache(slug, cues)
    return Response.json({ cues, cached: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ error: message }, { status: 500 })
  }
}
