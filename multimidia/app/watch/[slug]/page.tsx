import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { getVideo, listVideos } from "@/lib/videos"
import { VideoPlayer } from "@/components/video-player"

export async function generateStaticParams() {
  const videos = await listVideos()
  return videos.map((video) => ({ slug: video.slug }))
}

export default async function WatchPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const video = await getVideo(slug)
  if (!video) notFound()

  return (
    <main className="flex flex-1 flex-col">
      <div className="flex items-center gap-3 px-4 py-3">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-white/60 transition-colors hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Voltar
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-6">
        <VideoPlayer
          key={video.slug}
          src={video.src}
          slug={video.slug}
          title={video.title}
          className="w-full max-w-5xl rounded-xl"
        />
      </div>
    </main>
  )
}
