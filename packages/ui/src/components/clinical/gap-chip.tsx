import type { GapChip as GapChipModel } from "@asc/types"
import { CircleCheck, OctagonAlert, TriangleAlert } from "lucide-react"
import { cn } from "../../lib/utils"

export interface GapChipProps {
  readonly chip: GapChipModel
  /** Called when the user wants to resolve the gap (open an editor / dialog). */
  readonly onResolve?: (chip: GapChipModel) => void
  readonly className?: string
}

/** Missing-documentation marker on an AI note. Blocking chips disable signing (signGate). */
export function GapChip({ chip, onResolve, className }: GapChipProps) {
  const Icon = chip.resolved ? CircleCheck : chip.blocking ? OctagonAlert : TriangleAlert
  const tone = chip.resolved
    ? "border-success/30 bg-success/8 text-success"
    : chip.blocking
      ? "border-destructive/30 bg-destructive/8 text-destructive"
      : "border-warning/30 bg-warning/10 text-warning"
  const label = chip.resolved ? "Resolved" : chip.blocking ? "Blocks signing" : "Suggestion"
  return (
    <div
      data-testid="note-gap-chip"
      data-blocking={chip.blocking}
      data-resolved={chip.resolved}
      className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", tone, className)}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-[11px] font-semibold tracking-wide uppercase">{label}</p>
        <p className={cn("text-foreground", chip.resolved && "text-muted-foreground line-through")}>{chip.message}</p>
        {chip.resolution && <p className="text-xs text-muted-foreground">{chip.resolution}</p>}
      </div>
      {onResolve && !chip.resolved && (
        <button
          type="button"
          onClick={() => onResolve(chip)}
          data-testid="note-gap-resolve"
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          Resolve
        </button>
      )}
    </div>
  )
}
