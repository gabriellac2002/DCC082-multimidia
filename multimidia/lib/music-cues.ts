export interface MusicCue {
  start: number
  end: number
  title: string
  artist: string
  album: string
  year: number
  genre: string
  spotifyUrl: string
}

const IDENTIFY_LEAD_IN_SECONDS = 4

const MOCK_CUES: MusicCue[] = [
  {
    start: 18,
    end: 110,
    title: "Lay All Your Love on Me",
    artist: "ABBA",
    album: "Mamma Mia! (Original Motion Picture Soundtrack)",
    year: 2008,
    genre: "Pop",
    spotifyUrl:
      "https://open.spotify.com/search/Lay%20All%20Your%20Love%20on%20Me%20ABBA",
  },
]

export async function fetchMusicCues(_videoSrc: string): Promise<MusicCue[]> {
  await new Promise((resolve) => setTimeout(resolve, 400))
  return MOCK_CUES
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
