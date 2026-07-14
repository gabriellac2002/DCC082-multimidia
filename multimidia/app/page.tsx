import Link from "next/link"
import { Music, PlayCircle } from "lucide-react"

import { listVideos } from "@/lib/videos"

export default async function Home() {
  const videos = await listVideos()

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <header className="mb-10 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-medium tracking-wide text-emerald-400">
          <Music className="size-4" />
          RECONHECIMENTO DE MÚSICAS EM VÍDEO
        </div>
        <h1 className="text-3xl font-semibold text-white">Vídeos disponíveis</h1>
        <p className="max-w-2xl text-sm text-white/60">
          Escolha um vídeo para rodar o pipeline de identificação. Os trechos com
          música são detectados e reconhecidos automaticamente antes de abrir o
          player.
        </p>
      </header>

      {videos.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/60">
          Nenhum vídeo encontrado. Adicione arquivos em{" "}
          <code className="text-white/80">public/videos/</code>.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((video) => (
            <li key={video.slug}>
              <Link
                href={`/watch/${video.slug}`}
                className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/5 transition-colors hover:border-emerald-400/60 hover:bg-white/10"
              >
                <div className="relative aspect-video overflow-hidden bg-black">
                  <video
                    src={`${video.src}#t=1`}
                    preload="metadata"
                    muted
                    playsInline
                    className="size-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                    <PlayCircle className="size-12 text-white" />
                  </div>
                </div>
                <div className="p-4">
                  <div className="truncate text-sm font-semibold text-white">
                    {video.title}
                  </div>
                  <div className="mt-1 text-xs text-white/50">
                    Clique para processar e assistir
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
