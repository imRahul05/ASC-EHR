import { cn } from "../../lib/utils"

export interface SparklineProps {
  /** Values oldest → newest. */
  readonly values: readonly number[]
  /** Accessible summary, e.g. "Heart rate trend, last 72 bpm". */
  readonly label: string
  /** Optional fixed scale; defaults to the data range. */
  readonly min?: number
  readonly max?: number
  /** Colour via a text token class (stroke uses currentColor), e.g. `text-primary`. */
  readonly className?: string
}

const WIDTH = 100
const HEIGHT = 28
const PAD = 3

/** Tiny inline trend line (vitals mini trends, KPI tiles). Needs ≥ 2 values to draw a line. */
export function Sparkline({ values, label, min, max, className }: SparklineProps) {
  const low = min ?? Math.min(...values)
  const high = max ?? Math.max(...values)
  const span = high - low || 1
  const points = values.map((value, index) => ({
    x: values.length === 1 ? WIDTH / 2 : PAD + (index * (WIDTH - PAD * 2)) / (values.length - 1),
    y: HEIGHT - PAD - ((value - low) / span) * (HEIGHT - PAD * 2),
  }))
  const last = points.at(-1)
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={cn("h-7 w-24 overflow-visible text-primary", className)}
      data-testid="sparkline"
    >
      {points.length > 1 && (
        <polyline
          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {last && <circle cx={last.x} cy={last.y} r={2} fill="currentColor" />}
    </svg>
  )
}
