import { CircleCheck, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "../../lib/utils"

export interface TapTileProps {
  readonly label: string
  /** Secondary line, e.g. the recorded time `09:42` or a hint. */
  readonly detail?: ReactNode
  readonly icon?: LucideIcon
  /** Recorded / confirmed state (check icon + tint + `aria-pressed`). */
  readonly done?: boolean
  readonly disabled?: boolean
  readonly onClick?: () => void
  readonly className?: string
  readonly "data-testid"?: string
}

/**
 * Room-mode tap target (≥ 48 px, large type, high contrast) for event taps and checklist items.
 * State is icon + text + tint, never colour alone.
 */
export function TapTile({ label, detail, icon: Icon, done = false, disabled = false, onClick, className, "data-testid": testId }: TapTileProps) {
  const StateIcon = done ? CircleCheck : Icon
  return (
    <button
      type="button"
      aria-pressed={done}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      data-done={done}
      className={cn(
        "flex min-h-16 w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors outline-none focus-visible:ring-4 focus-visible:ring-ring/50 disabled:cursor-not-allowed",
        done
          ? "border-success/50 bg-success/10 text-foreground"
          : "border-border bg-card text-foreground hover:border-primary/60 hover:bg-accent disabled:opacity-50",
        className
      )}
    >
      {StateIcon && <StateIcon aria-hidden className={cn("size-6 shrink-0", done ? "text-success" : "text-muted-foreground")} />}
      <span className="min-w-0 flex-1">
        <span className="block text-base leading-tight font-semibold">{label}</span>
        {detail && <span className="block text-sm text-muted-foreground tabular-nums">{detail}</span>}
      </span>
      {done && <span className="sr-only">(recorded)</span>}
    </button>
  )
}
