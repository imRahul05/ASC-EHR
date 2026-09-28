import type { ReactNode } from "react"
import { cn } from "../../lib/utils"

export interface TargetBarRow {
  readonly id: string
  readonly label: ReactNode
  readonly value: number
  /** Secondary text under the label (e.g. `142 cases`). */
  readonly hint?: ReactNode
}

export interface TargetBarListProps {
  readonly rows: readonly TargetBarRow[]
  /** Upper end of the scale (bars grow from 0). */
  readonly max: number
  readonly formatValue: (value: number) => string
  /** Benchmarks drawn as labelled vertical threshold lines. */
  readonly targets?: readonly { readonly value: number; readonly label: string }[]
  readonly className?: string
  readonly "data-testid"?: string
}

/**
 * Horizontal bars (single series, `chart-1`) against labelled target lines — e.g. ADR by surgeon vs 25 % / 30 %.
 * Value is direct-labelled at the bar tip; each row is focusable with the full reading as its accessible name.
 */
export function TargetBarList({ rows, max, formatValue, targets = [], className, "data-testid": testId }: TargetBarListProps) {
  const pct = (value: number) => `${Math.min(100, Math.max(0, (value / max) * 100))}%`
  return (
    <div data-testid={testId} className={cn("grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3.5rem] items-center gap-x-3 gap-y-3", className)}>
      <span />
      <div className="relative h-4" aria-hidden>
        {targets.map((target, index) => (
          <span
            key={target.label}
            className={cn(
              "absolute text-[11px] whitespace-nowrap text-muted-foreground",
              // First label sits left of its line, the rest to the right, so close targets never collide.
              index === 0 && targets.length > 1 ? "-translate-x-full pr-1.5 text-right" : "pl-1.5"
            )}
            style={{ left: pct(target.value) }}
          >
            {target.label}
          </span>
        ))}
      </div>
      <span />
      {rows.map((row) => {
        const passed = targets.filter((target) => row.value >= target.value).map((target) => target.label)
        return (
          <div
            key={row.id}
            tabIndex={0}
            aria-label={`${typeof row.label === "string" ? row.label : row.id}: ${formatValue(row.value)}${passed.length ? `, meets ${passed.join(" and ")}` : ", below target"}`}
            className="group col-span-3 grid grid-cols-subgrid items-center rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{row.label}</p>
              {row.hint && <p className="truncate text-xs text-muted-foreground">{row.hint}</p>}
            </div>
            <div className="relative h-6" aria-hidden>
              <span className="absolute inset-y-2 left-0 w-full rounded-[4px] bg-muted" />
              <span
                className="absolute inset-y-1.5 left-0 rounded-r-[4px] bg-chart-1 transition-opacity group-hover:opacity-85"
                style={{ width: pct(row.value) }}
              />
              {targets.map((target) => (
                <span key={target.label} className="absolute inset-y-0 w-px bg-foreground/50" style={{ left: pct(target.value) }} />
              ))}
            </div>
            <span className="text-right text-sm font-medium text-foreground tabular-nums">{formatValue(row.value)}</span>
          </div>
        )
      })}
    </div>
  )
}
