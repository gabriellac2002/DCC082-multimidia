export interface MusicCue {
  start: number
  end: number
  matched: boolean
  title: string | null
  artist: string | null
  confidence: number | null
  album?: string
  year?: number
  genre?: string
  spotifyUrl?: string
}

const IDENTIFY_LEAD_IN_SECONDS = 4

export async function fetchMusicCues(slug: string): Promise<MusicCue[]> {
  const res = await fetch(`/api/cues/${slug}`)
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error ?? "Falha ao processar o pipeline")
  }
  return data.cues as MusicCue[]
}

export function findActiveCue(cues: MusicCue[], currentTime: number) {
  const cue = cues.find(
    (c) =>
      currentTime >= c.start - IDENTIFY_LEAD_IN_SECONDS && currentTime < c.end
  )
  if (!cue) return null

  const phase = currentTime < cue.start ? "identifying" : "playing"
  return { cue, phase } as const
}
