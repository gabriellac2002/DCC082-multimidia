"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { formatTime } from "@/lib/format-time"
import { fetchMusicCues, findActiveCue, type MusicCue } from "@/lib/music-cues"
import { Button } from "@/components/ui/button"
import { Toggle } from "@/components/ui/toggle"
import {
  IdentifyingCard,
  NowPlayingCard,
} from "@/components/music-detection-card"
import {
  VideoProgressBar,
  type VideoChapter,
} from "@/components/video-progress-bar"

const MUSIC_CUE_COLOR = "#2dd4bf"
const UNMATCHED_CUE_COLOR = "#64748b"

type CuesStatus = "loading" | "ready" | "error"

interface VideoPlayerProps {
  src: string
  slug: string
  title?: string
  chapters?: VideoChapter[]
  className?: string
}

export function VideoPlayer({
  src,
  slug,
  title,
  chapters = [],
  className,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [musicCues, setMusicCues] = useState<MusicCue[]>([])
  const [cuesStatus, setCuesStatus] = useState<CuesStatus>("loading")
  const [cuesError, setCuesError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchMusicCues(slug)
      .then((cues) => {
        if (cancelled) return
        setMusicCues(cues)
        setCuesStatus("ready")
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setCuesError(error instanceof Error ? error.message : String(error))
        setCuesStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  const activeMusicCue = findActiveCue(musicCues, currentTime)

  const allChapters = useMemo(
    () => [
      ...chapters,
      ...musicCues.map((cue) => ({
        start: cue.start,
        end: cue.end,
        color: cue.matched ? MUSIC_CUE_COLOR : UNMATCHED_CUE_COLOR,
      })),
    ],
    [chapters, musicCues]
  )

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onTimeUpdate = () => setCurrentTime(video.currentTime)
    const onLoadedMetadata = () => setDuration(video.duration)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onVolumeChange = () => setIsMuted(video.muted)
    const onProgress = () => {
      const { buffered } = video
      if (buffered.length > 0) {
        try {
          setBuffered(buffered.end(buffered.length - 1))
        } catch {}
      }
    }

    video.addEventListener("timeupdate", onTimeUpdate)
    video.addEventListener("loadedmetadata", onLoadedMetadata)
    video.addEventListener("play", onPlay)
    video.addEventListener("pause", onPause)
    video.addEventListener("volumechange", onVolumeChange)
    video.addEventListener("progress", onProgress)

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate)
      video.removeEventListener("loadedmetadata", onLoadedMetadata)
      video.removeEventListener("play", onPlay)
      video.removeEventListener("pause", onPause)
      video.removeEventListener("volumechange", onVolumeChange)
      video.removeEventListener("progress", onProgress)
    }
  }, [])

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    }
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])

  function togglePlay() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play()
    } else {
      video.pause()
    }
  }

  function toggleMute() {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
  }

  function toggleFullscreen() {
    const container = containerRef.current
    if (!container) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      container.requestFullscreen()
    }
  }

  function handleSeek(time: number) {
    const video = videoRef.current
    if (!video) return
    video.currentTime = time
    setCurrentTime(time)
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "group/player relative flex aspect-video w-full items-center justify-center overflow-hidden bg-black",
        className
      )}
    >
      <video
        ref={videoRef}
        src={src}
        className="size-full object-contain"
        onClick={togglePlay}
        playsInline
      />

      {cuesStatus === "loading" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm">
          <div className="relative flex size-14 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600">
            <div className="absolute inset-x-0 h-3 -translate-y-1/2 animate-scan-light bg-emerald-300/80 blur-[3px]" />
            <Loader2 className="relative z-10 size-6 animate-spin text-white" />
          </div>
          <div className="flex flex-col items-center gap-1 text-center">
            <div className="text-sm font-medium text-white">
              Processando o pipeline…
            </div>
            <div className="max-w-xs text-xs text-white/60">
              Detectando trechos de música e identificando as faixas no vídeo.
              Isso pode levar alguns minutos na primeira vez.
            </div>
          </div>
        </div>
      )}

      {cuesStatus === "error" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70 p-6 backdrop-blur-sm">
          <AlertTriangle className="size-8 text-amber-400" />
          <div className="text-sm font-medium text-white">
            Não foi possível processar o vídeo
          </div>
          <pre className="max-h-40 max-w-lg overflow-auto rounded-md bg-black/60 p-3 text-left text-[11px] whitespace-pre-wrap text-white/60">
            {cuesError}
          </pre>
        </div>
      )}

      {!isPlaying && (
        <button
          onClick={togglePlay}
          aria-label="Reproduzir"
          className="absolute top-1/2 left-1/2 z-10 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform hover:scale-105"
        >
          <Play className="size-6 fill-current" />
        </button>
      )}

      {activeMusicCue && (
        <div className="absolute right-4 bottom-24 z-10">
          {activeMusicCue.phase === "identifying" ? (
            <IdentifyingCard />
          ) : (
            <NowPlayingCard
              cue={activeMusicCue.cue}
              currentTime={currentTime}
            />
          )}
        </div>
      )}

      <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/80 via-transparent to-black/40">
        {title && (
          <div className="p-4 text-sm font-medium text-white">{title}</div>
        )}

        <div className="flex flex-col gap-1 px-4 pb-3">
          <VideoProgressBar
            currentTime={currentTime}
            duration={duration}
            buffered={buffered}
            chapters={allChapters}
            onSeek={handleSeek}
          />

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full bg-white text-black hover:bg-white/90 hover:text-black"
              onClick={togglePlay}
            >
              {isPlaying ? (
                <Pause className="fill-current" />
              ) : (
                <Play className="fill-current" />
              )}
            </Button>

            <Toggle
              pressed={isMuted}
              onPressedChange={toggleMute}
              className="text-white hover:bg-white/10 hover:text-white data-pressed:bg-white/10 data-pressed:text-white"
            >
              {isMuted ? <VolumeX /> : <Volume2 />}
            </Toggle>

            <span className="text-xs tabular-nums text-white/80">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <div className="flex-1" />

            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10 hover:text-white"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Minimize /> : <Maximize />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
