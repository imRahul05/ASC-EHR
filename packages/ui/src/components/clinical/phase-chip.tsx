import { PHASE_GROUP, PHASE_LABEL } from "@asc/clinical-rules"
import type { CasePhase } from "@asc/types"
import { cn } from "../../lib/utils"
import { PHASE_GROUP_CLASS, PHASE_GROUP_ICON } from "./phase-style"

export interface PhaseChipProps {
  readonly phase: CasePhase
  readonly size?: "sm" | "md"
  readonly className?: string
}

/** Case phase as a tinted chip (colour + icon + label). */
export function PhaseChip({ phase, size = "sm", className }: PhaseChipProps) {
  const group = PHASE_GROUP[phase]
  const Icon = PHASE_GROUP_ICON[group]
  return (
    <span
      data-testid="case-phase-chip"
      data-phase={phase}
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 rounded-full font-medium whitespace-nowrap",
        size === "sm" ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-xs",
        PHASE_GROUP_CLASS[group],
        className
      )}
    >
      <Icon aria-hidden className={size === "sm" ? "size-3" : "size-3.5"} />
      {PHASE_LABEL[phase]}
    </span>
  )
}
