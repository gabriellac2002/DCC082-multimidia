export interface ExplainPoint {
  x: number
  y: number
}

export interface ExplainPair {
  a: ExplainPoint
  b: ExplainPoint
  m: boolean
}

export interface HistogramBin {
  o: number
  c: number
  peak: boolean
}

export interface ExplainData {
  segment: { start: number; end: number }
  spectrogram: {
    image: string
    width: number
    height: number
    durationSec: number
    freqMaxHz: number
  }
  peaks: ExplainPoint[]
  peakCount: number
  pairs: ExplainPair[]
  pairCount: number
  match: {
    matched: boolean
    title: string | null
    artist: string | null
    confidence: number
    aligned: number
    totalHashes: number
    offsetSeconds: number
  }
  histogram: {
    bins: HistogramBin[]
    binSeconds: number
    peakOffset: number
  }
}

export async function fetchExplain(
  slug: string,
  start: number,
  end: number
): Promise<ExplainData> {
  const res = await fetch(
    `/api/explain/${slug}?start=${start.toFixed(2)}&end=${end.toFixed(2)}`
  )
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error ?? "Falha ao gerar a explicação")
  }
  return data as ExplainData
}
