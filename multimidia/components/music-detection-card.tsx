import { AudioLines, Music, Play } from "lucide-react"

import { cn } from "@/lib/utils"
import { formatTime } from "@/lib/format-time"
import type { MusicCue } from "@/lib/music-cues"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"

export function IdentifyingCard() {
  return (
    <Card className="w-72 flex-row items-center gap-3 border-white/10 bg-black/70 px-3 py-3 text-white ring-white/10 backdrop-blur-sm">
      <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-teal-400 to-emerald-600">
        <div className="absolute inset-x-0 h-3 -translate-y-1/2 animate-scan-light bg-emerald-300/80 blur-[3px]" />
        <Music className="relative z-10 size-5 text-white" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-emerald-400">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
          IDENTIFICANDO MÚSICA
        </div>
        <div className="text-sm text-white">Ouvindo o trecho...</div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-emerald-400" />
        </div>
      </div>
    </Card>
  )
}

interface NowPlayingCardProps {
  cue: MusicCue
  currentTime: number
}

export function NowPlayingCard({ cue, currentTime }: NowPlayingCardProps) {
  const cueDuration = cue.end - cue.start
  const elapsed = Math.min(Math.max(currentTime - cue.start, 0), cueDuration)
  const progress = cueDuration > 0 ? elapsed / cueDuration : 0

  return (
    <Card className="w-72 gap-3 border-white/10 bg-black/70 py-3 text-white ring-white/10 backdrop-blur-sm">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-emerald-400">
          <AudioLines className="size-3.5" />
          TOCANDO AGORA
        </div>

        <div className="flex gap-3">
          <div className="size-12 shrink-0 rounded-md bg-gradient-to-br from-teal-300 via-emerald-500 to-pink-400" />
          <div className="flex min-w-0 flex-col justify-center gap-0.5">
            <div className="truncate text-sm font-semibold">
              {cue.title ?? "Música não identificada"}
            </div>
            {cue.artist && (
              <div className="truncate text-xs text-white/60">{cue.artist}</div>
            )}
            {(cue.genre || cue.year) && (
              <div className="flex items-center gap-1.5 text-[11px] text-white/50">
                {cue.genre && (
                  <Badge
                    variant="secondary"
                    className="bg-white/10 text-white/70"
                  >
                    {cue.genre}
                  </Badge>
                )}
                {cue.year && <span>{cue.year}</span>}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-emerald-400"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-white/50">
            <span>{formatTime(elapsed)}</span>
            <span>trecho no vídeo</span>
            <span>{formatTime(cueDuration)}</span>
          </div>
        </div>

        {cue.spotifyUrl && (
          <a
            href={cue.spotifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ variant: "default" }),
              "h-8 w-full justify-center rounded-full bg-emerald-500 text-black hover:bg-emerald-400"
            )}
          >
            <Play className="fill-current" />
            Ouvir no Spotify
          </a>
        )}
      </CardContent>
    </Card>
  )
}
