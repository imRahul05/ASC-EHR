import { cn } from "../../lib/utils"

export interface ConfidenceBadgeProps {
  /** Model confidence 0–1. */
  readonly value: number
  readonly className?: string
}

type ConfidenceTone = "high" | "medium" | "low"

const TONE_CLASS: Readonly<Record<ConfidenceTone, string>> = {
  high: "border-border text-muted-foreground",
  medium: "border-warning/30 bg-warning/10 text-warning",
  low: "border-destructive/30 bg-destructive/8 text-destructive",
}

const TONE_LABEL: Readonly<Record<ConfidenceTone, string>> = { high: "high", medium: "check", low: "low" }

/** Thresholds: ≥ 0.9 high, ≥ 0.85 check, below = low (review first). */
export function confidenceTone(value: number): ConfidenceTone {
  if (value >= 0.9) return "high"
  return value >= 0.85 ? "medium" : "low"
}

/** AI confidence as percent + word (colour is never the only signal). */
export function ConfidenceBadge({ value, className }: ConfidenceBadgeProps) {
  const tone = confidenceTone(value)
  const percent = Math.round(value * 100)
  return (
    <span
      data-testid="confidence-badge"
      data-tone={tone}
      title={`Model confidence ${percent}%`}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-1.5 text-[11px] font-medium whitespace-nowrap tabular-nums",
        TONE_CLASS[tone],
        className
      )}
    >
      {percent}%<span className="text-[10px] opacity-80">{TONE_LABEL[tone]}</span>
    </span>
  )
}
