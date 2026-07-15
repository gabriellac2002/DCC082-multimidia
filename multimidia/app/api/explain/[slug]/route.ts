import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

import { getVideo } from "@/lib/videos"

const PROJECT_ROOT = path.join(process.cwd(), "..")
const EXPLAIN_SCRIPT = path.join(PROJECT_ROOT, "explain.py")
const DB_PATH = path.join(PROJECT_ROOT, "fingerprints.db")
const CACHE_DIR = path.join(process.cwd(), ".cue-cache", "explain")
const PYTHON = process.env.PYTHON_BIN ?? "python3"

function cacheKey(slug: string, start: number, end: number): string {
  return `${slug}-${start.toFixed(2)}-${end.toFixed(2)}.json`
}

async function readCache(file: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(CACHE_DIR, file), "utf-8"))
  } catch {
    return null
  }
}

async function writeCache(file: string, data: string): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true })
  await fs.writeFile(path.join(CACHE_DIR, file), data, "utf-8")
}

function runExplain(
  videoPath: string,
  start: number,
  end: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      PYTHON,
      [
        EXPLAIN_SCRIPT,
        "--video", videoPath,
        "--start", String(start),
        "--end", String(end),
        "--db", DB_PATH,
      ],
      { cwd: PROJECT_ROOT }
    )

    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (c) => (stdout += c))
    child.stderr.on("data", (c) => (stderr += c))
    child.on("error", reject)
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `explain saiu com codigo ${code}`))
        return
      }
      resolve(stdout)
    })
  })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const url = new URL(request.url)
  const start = Number(url.searchParams.get("start"))
  const end = Number(url.searchParams.get("end"))

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return Response.json({ error: "start/end invalidos" }, { status: 400 })
  }

  const video = await getVideo(slug)
  if (!video) {
    return Response.json({ error: "video nao encontrado" }, { status: 404 })
  }

  const file = cacheKey(slug, start, end)
  const force = url.searchParams.get("force") === "1"
  if (!force) {
    const cached = await readCache(file)
    if (cached) return Response.json(cached)
  }

  const videoPath = path.join(process.cwd(), "public", "videos", video.file)
  try {
    const raw = await runExplain(videoPath, start, end)
    JSON.parse(raw)
    await writeCache(file, raw)
    return new Response(raw, {
      headers: { "content-type": "application/json" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ error: message }, { status: 500 })
  }
}
