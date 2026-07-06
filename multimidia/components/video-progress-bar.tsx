"use client"

import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

export type VideoChapter = {
  start: number
  end: number
  color: string
  label?: string
}

interface VideoProgressBarProps {
  currentTime: number
  duration: number
  buffered?: number
  chapters?: VideoChapter[]
  onSeek: (time: number) => void
  className?: string
}

export function VideoProgressBar({
  currentTime,
  duration,
  buffered = 0,
  chapters = [],
  onSeek,
  className,
}: VideoProgressBarProps) {
  const max = duration || 0.1

  return (
    <SliderPrimitive.Root
      className={cn("relative w-full", className)}
      min={0}
      max={max}
      step={0.1}
      value={Math.min(currentTime, max)}
      onValueChange={(value) => onSeek(value as number)}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center py-2 select-none">
        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-white/25 select-none">
          {chapters.map((chapter, i) => (
            <div
              key={i}
              style={{
                left: `${(chapter.start / max) * 100}%`,
                width: `${((chapter.end - chapter.start) / max) * 100}%`,
                backgroundColor: chapter.color,
              }}
              className="absolute inset-y-0 h-full opacity-50"
            />
          ))}
          {buffered > 0 && (
            <div
              className="absolute inset-y-0 left-0 h-full bg-white/30"
              style={{ width: `${(buffered / max) * 100}%` }}
            />
          )}
          <SliderPrimitive.Indicator className="absolute inset-y-0 left-0 h-full bg-white select-none" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="relative block size-3.5 shrink-0 rounded-full bg-white opacity-0 shadow transition-opacity select-none group-hover/player:opacity-100 focus-visible:opacity-100 focus-visible:outline-hidden" />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}
