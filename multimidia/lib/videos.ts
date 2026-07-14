import fs from "node:fs/promises"
import path from "node:path"

export const VIDEOS_DIR = path.join(process.cwd(), "public", "videos")

const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".m4v", ".ogg"])

export interface VideoItem {
  slug: string
  title: string
  file: string
  src: string
}

function toSlug(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function toItem(file: string): VideoItem {
  return {
    slug: toSlug(file),
    title: file.replace(/\.[^.]+$/, ""),
    file,
    src: `/videos/${encodeURIComponent(file)}`,
  }
}

export async function listVideos(): Promise<VideoItem[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(VIDEOS_DIR)
  } catch {
    return []
  }

  return entries
    .filter((file) => VIDEO_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .map(toItem)
    .sort((a, b) => a.title.localeCompare(b.title))
}

export async function getVideo(slug: string): Promise<VideoItem | null> {
  const videos = await listVideos()
  return videos.find((video) => video.slug === slug) ?? null
}
