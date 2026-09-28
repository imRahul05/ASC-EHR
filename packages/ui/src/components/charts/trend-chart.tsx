"use client"

import { useState, type KeyboardEvent, type PointerEvent } from "react"
import { cn } from "../../lib/utils"

export interface TrendPoint {
  /** Stable key (e.g. ISO date). */
  readonly key: string
  /** Axis / tooltip label (e.g. `Sep 28`). */
  readonly label: string
  readonly value: number
}

export interface TrendTarget {
  readonly value: number
  readonly label: string
}

export interface TrendChartProps {
  readonly points: readonly TrendPoint[]
  /** Accessible name, e.g. "Adenoma detection rate, last 30 days". */
  readonly title: string
  readonly formatValue: (value: number) => string
  /** Benchmark drawn as a labelled threshold line. */
  readonly target?: TrendTarget
  /** Fixed y-domain; default = data (+ target) with padding. */
  readonly domain?: readonly [number, number]
  readonly height?: number
  readonly className?: string
  readonly "data-testid"?: string
}

const TICKS = 3
const VIEW_W = 100

function niceDomain(values: readonly number[]): [number, number] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = (max - min || Math.abs(max) || 1) * 0.15
  return [min - pad, max + pad]
}

/**
 * Single-series line over time (2 px line, 10 % area wash, end dot with surface ring, hairline grid),
 * optional dashed target line, crosshair + tooltip on hover and ←/→ on focus. Colours: `chart-1` token only.
 */
export function TrendChart({
  points,
  title,
  formatValue,
  target,
  domain,
  height = 140,
  className,
  "data-testid": testId,
}: TrendChartProps) {
  const [active, setActive] = useState<number | null>(null)
  const values = points.map((point) => point.value)
  const [lo, hi] = domain ?? niceDomain(target ? [...values, target.value] : values)
  const span = hi - lo || 1
  const xPct = (index: number) => (points.length <= 1 ? 50 : (index / (points.length - 1)) * 100)
  const yPct = (value: number) => 100 - ((value - lo) / span) * 100
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${(xPct(index) / 100) * VIEW_W},${yPct(point.value)}`).join(" ")
  const area = points.length > 1 ? `${path} L${VIEW_W},100 L0,100 Z` : ""
  const ticks = Array.from({ length: TICKS }, (_, index) => lo + (span * index) / (TICKS - 1))
  const last = points.at(-1)
  const shown = active !== null ? points[active] : undefined
  const markerIndex = active ?? points.length - 1
  const marker = points[markerIndex]

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    setActive(Math.round(ratio * (points.length - 1)))
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    setActive((current) => Math.min(points.length - 1, Math.max(0, (current ?? points.length - 1) + step)))
  }

  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">No data for this period.</p>
  }

  return (
    <figure data-testid={testId} className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-x-2", className)}>
      <div className="relative w-12 text-right text-[11px] whitespace-nowrap text-muted-foreground tabular-nums" style={{ height }} aria-hidden>
        {ticks.map((tick) => (
          <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: `${yPct(tick)}%` }}>
            {formatValue(tick)}
          </span>
        ))}
      </div>
      <div
        role="img"
        aria-label={`${title}. Latest ${last ? formatValue(last.value) : "—"}${target ? `; target ${target.label}` : ""}.`}
        tabIndex={0}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(points.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKeyDown}
        className="relative cursor-crosshair touch-none rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        style={{ height }}
      >
        {ticks.map((tick) => (
          <span key={tick} aria-hidden className="absolute inset-x-0 h-px bg-border" style={{ top: `${yPct(tick)}%` }} />
        ))}
        {target && (
          <div aria-hidden className="absolute inset-x-0" style={{ top: `${yPct(target.value)}%` }}>
            <span className="absolute inset-x-0 border-t border-dashed border-muted-foreground/60" />
            <span className="absolute left-1 z-10 -translate-y-full rounded-sm bg-card/85 px-1 pb-0.5 text-[11px] text-muted-foreground">{target.label}</span>
          </div>
        )}
        <svg viewBox={`0 0 ${VIEW_W} 100`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
          {area && <path d={area} className="fill-chart-1/10" />}
          <path
            d={path}
            fill="none"
            className="stroke-chart-1"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {active !== null && (
          <span aria-hidden className="absolute inset-y-0 w-px bg-foreground/25" style={{ left: `${xPct(active)}%` }} />
        )}
        {marker && (
          <span
            aria-hidden
            className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-chart-1 ring-2 ring-card"
            style={{ left: `${xPct(markerIndex)}%`, top: `${yPct(marker.value)}%` }}
          />
        )}
        {shown && active !== null && (
          <div
            role="status"
            className={cn(
              "pointer-events-none absolute top-0 z-10 min-w-24 rounded-md border border-border bg-popover px-2 py-1.5 text-xs shadow-sm",
              xPct(active) > 60 ? "-translate-x-[calc(100%+8px)]" : "translate-x-2"
            )}
            style={{ left: `${xPct(active)}%` }}
          >
            <p className="font-semibold text-foreground tabular-nums">{formatValue(shown.value)}</p>
            <p className="text-muted-foreground">{shown.label}</p>
          </div>
        )}
      </div>
      <span aria-hidden />
      <div aria-hidden className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{points[0]?.label}</span>
        <span>{last?.label}</span>
      </div>
    </figure>
  )
}
