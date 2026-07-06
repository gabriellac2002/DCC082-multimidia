"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Maximize, Minimize, Pause, Play, Volume2, VolumeX } from "lucide-react"

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

interface VideoPlayerProps {
  src: string
  title?: string
  chapters?: VideoChapter[]
  className?: string
}

export function VideoPlayer({
  src,
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

  useEffect(() => {
    let cancelled = false
    fetchMusicCues(src).then((cues) => {
      if (!cancelled) setMusicCues(cues)
    })
    return () => {
      cancelled = true
    }
  }, [src])

  const activeMusicCue = findActiveCue(musicCues, currentTime)

  const allChapters = useMemo(
    () => [
      ...chapters,
      ...musicCues.map((cue) => ({
        start: cue.start,
        end: cue.end,
        color: MUSIC_CUE_COLOR,
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
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1))
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
