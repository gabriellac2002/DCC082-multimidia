"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Loader2, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { fetchExplain, type ExplainData } from "@/lib/explain"

const STEPS = [
  { label: "Espectrograma", hint: "A energia do áudio por frequência (vertical) e tempo (horizontal). Quanto mais claro, mais forte." },
  { label: "Picos", hint: "Os máximos locais mais fortes do espectrograma — a “constellation map”. São eles, e não o áudio, que viram impressão digital." },
  { label: "Pares de hash", hint: "Cada pico-âncora é ligado a picos seguintes. Cada ligação (âncora → alvo) vira um hash robusto a ruído." },
  { label: "Match", hint: "Em destaque, os pares cujo deslocamento no tempo bateu com a música identificada — a evidência do reconhecimento." },
]

interface ExplainPanelProps {
  slug: string
  title: string
  start: number
  end: number
  onClose: () => void
}

export function ExplainPanel({
  slug,
  title,
  start,
  end,
  onClose,
}: ExplainPanelProps) {
  const [data, setData] = useState<ExplainData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchExplain(slug, start, end)
      .then((d) => !cancelled && setData(d))
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [slug, start, end])

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <aside className="fixed top-0 right-0 z-50 flex h-screen w-full max-w-[460px] flex-col border-l border-white/10 bg-neutral-950 text-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Como o reconhecimento funciona</h2>
            <p className="mt-0.5 truncate text-xs text-white/50">
              {title} · trecho {start.toFixed(1)}s–{end.toFixed(1)}s
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {!data && !error && (
            <div className="flex h-40 flex-col items-center justify-center gap-3 text-white/60">
              <Loader2 className="size-6 animate-spin" />
              <span className="text-xs">Gerando fingerprint do trecho…</span>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-center">
              <AlertTriangle className="size-6 text-amber-400" />
              <span className="text-xs text-white/70">{error}</span>
            </div>
          )}

          {data && <ExplainBody data={data} step={step} setStep={setStep} />}
        </div>
      </aside>
    </>
  )
}

function ExplainBody({
  data,
  step,
  setStep,
}: {
  data: ExplainData
  step: number
  setStep: (s: number) => void
}) {
  const { match } = data

  return (
    <div className="flex flex-col gap-5">
      <MatchSummary data={data} />

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {STEPS.map((s, i) => (
            <button
              key={s.label}
              onClick={() => setStep(i)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                i === step
                  ? "bg-emerald-500 text-black"
                  : "bg-white/10 text-white/70 hover:bg-white/20"
              )}
            >
              {i + 1}. {s.label}
            </button>
          ))}
        </div>

        <Spectrogram data={data} step={step} />

        <p className="text-xs leading-relaxed text-white/60">{STEPS[step].hint}</p>
      </section>

      <AlignmentHistogram data={data} />

      <section className="grid grid-cols-2 gap-2 text-xs">
        <Stat label="Picos detectados" value={data.peakCount.toLocaleString("pt-BR")} />
        <Stat label="Hashes gerados" value={data.pairCount.toLocaleString("pt-BR")} />
        <Stat label="Hashes alinhados" value={match.aligned.toLocaleString("pt-BR")} />
        <Stat label="Deslocamento" value={`${match.offsetSeconds.toFixed(1)} s`} />
      </section>
    </div>
  )
}

function MatchSummary({ data }: { data: ExplainData }) {
  const { match } = data
  return (
    <section
      className={cn(
        "rounded-lg border p-3",
        match.matched
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-white/10 bg-white/5"
      )}
    >
      <div className="text-[11px] font-medium tracking-wide text-white/50">
        {match.matched ? "MÚSICA IDENTIFICADA" : "SEM MATCH CONFIÁVEL"}
      </div>
      <div className="mt-1 text-sm font-semibold">
        {match.title ?? "Não identificada"}
      </div>
      {match.matched && (
        <div className="mt-1 text-xs text-white/60">
          Confiança {(match.confidence * 100).toFixed(1)}% · {match.aligned.toLocaleString("pt-BR")} de{" "}
          {match.totalHashes.toLocaleString("pt-BR")} hashes alinhados
        </div>
      )}
    </section>
  )
}

function Spectrogram({ data, step }: { data: ExplainData; step: number }) {
  const { image, width, height } = data.spectrogram
  const r = Math.max(1.4, width * 0.006)

  const px = (x: number) => x * width
  const py = (y: number) => (1 - y) * height

  const showPeaks = step >= 1
  const showAllPairs = step === 2
  const showMatch = step === 3

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg bg-black"
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <img src={image} alt="Espectrograma" className="absolute inset-0 size-full" />
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
      >
        {showAllPairs &&
          data.pairs.map((p, i) => (
            <line
              key={`ap-${i}`}
              x1={px(p.a.x)}
              y1={py(p.a.y)}
              x2={px(p.b.x)}
              y2={py(p.b.y)}
              stroke={p.m ? "rgba(45,212,191,0.7)" : "rgba(255,255,255,0.18)"}
              strokeWidth={p.m ? 1.2 : 0.8}
              vectorEffect="non-scaling-stroke"
            />
          ))}

        {showMatch &&
          data.pairs
            .filter((p) => p.m)
            .map((p, i) => (
              <line
                key={`mp-${i}`}
                x1={px(p.a.x)}
                y1={py(p.a.y)}
                x2={px(p.b.x)}
                y2={py(p.b.y)}
                stroke="rgba(52,211,153,0.9)"
                strokeWidth={1.4}
                vectorEffect="non-scaling-stroke"
              />
            ))}

        {showPeaks &&
          data.peaks.map((p, i) => (
            <circle
              key={`pk-${i}`}
              cx={px(p.x)}
              cy={py(p.y)}
              r={r}
              fill="#fbbf24"
              fillOpacity={0.9}
            />
          ))}
      </svg>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between px-2 py-1 text-[10px] text-white/50">
        <span>0 s</span>
        <span>{data.spectrogram.durationSec.toFixed(1)} s</span>
      </div>
      <div className="pointer-events-none absolute top-1 left-1 text-[10px] text-white/50">
        {(data.spectrogram.freqMaxHz / 1000).toFixed(0)} kHz
      </div>
    </div>
  )
}

function AlignmentHistogram({ data }: { data: ExplainData }) {
  const W = 400
  const H = 220
  const pad = { l: 40, r: 10, t: 18, b: 34 }
  const bins = data.histogram.bins

  const { oMin, oMax, cMax } = useMemo(() => {
    let oMin = Infinity
    let oMax = -Infinity
    let cMax = 0
    for (const b of bins) {
      if (b.o < oMin) oMin = b.o
      if (b.o > oMax) oMax = b.o
      if (b.c > cMax) cMax = b.c
    }
    if (!isFinite(oMin)) {
      oMin = 0
      oMax = 1
    }
    return { oMin, oMax, cMax: cMax || 1 }
  }, [bins])

  if (bins.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold text-white/80">Histograma de alinhamento</h3>
        <div className="rounded-lg border border-white/10 bg-black/40 p-4 text-center text-xs text-white/50">
          Nenhum hash em comum se acumulou num deslocamento — sem match confiável.
        </div>
      </section>
    )
  }

  const plotW = W - pad.l - pad.r
  const plotH = H - pad.t - pad.b
  const span = oMax - oMin || 1
  const sx = (o: number) => pad.l + ((o - oMin) / span) * plotW
  const sy = (c: number) => H - pad.b - (c / cMax) * plotH
  const barW = Math.max(1.5, (plotW / bins.length) * 0.8)

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-white/80">Histograma de alinhamento</h3>
      <div className="overflow-hidden rounded-lg border border-white/10 bg-black/40">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="rgba(255,255,255,0.2)" />
          <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke="rgba(255,255,255,0.2)" />

          {bins.map((b, i) => {
            const y = sy(b.c)
            return (
              <rect
                key={i}
                x={sx(b.o) - barW / 2}
                y={y}
                width={barW}
                height={H - pad.b - y}
                fill={b.peak ? "#34d399" : "rgba(255,255,255,0.28)"}
              >
                <title>{`${b.o.toFixed(1)}s · ${b.c} hashes`}</title>
              </rect>
            )
          })}

          <text
            x={sx(data.histogram.peakOffset)}
            y={pad.t - 6}
            textAnchor="middle"
            className="fill-emerald-300"
            fontSize="10"
          >
            {data.histogram.peakOffset.toFixed(1)}s · {cMax}
          </text>

          <text x={pad.l} y={H - 6} textAnchor="start" className="fill-white/40" fontSize="9">
            {oMin.toFixed(0)}s
          </text>
          <text x={W - pad.r} y={H - 6} textAnchor="end" className="fill-white/40" fontSize="9">
            {oMax.toFixed(0)}s
          </text>
          <text x={(pad.l + W - pad.r) / 2} y={H - 6} textAnchor="middle" className="fill-white/50" fontSize="10">
            deslocamento no tempo (s)
          </text>
          <text x={-H / 2} y={11} transform="rotate(-90)" textAnchor="middle" className="fill-white/50" fontSize="10">
            hashes concordando
          </text>
        </svg>
      </div>
      <p className="text-xs leading-relaxed text-white/60">
        Cada barra conta quantos hashes em comum apontam para o mesmo deslocamento
        entre o trecho e a música. Se é a mesma gravação, quase todos concordam num
        único deslocamento — o pico verde. As barras baixas e espalhadas são
        coincidências aleatórias, que não se acumulam em lugar nenhum.
      </p>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-2.5">
      <div className="text-[10px] tracking-wide text-white/40">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  )
}
