import { PHASE_GROUP, PHASE_LABEL, PHASE_ORDER, phaseIndex } from "@asc/clinical-rules"
import type { CasePhase } from "@asc/types"
import { CheckIcon } from "lucide-react"
import { cn } from "../../lib/utils"
import { PHASE_GROUP_DOT } from "./phase-style"

export interface PhaseStepperProps {
  readonly phase: CasePhase
  /** Optional subset of phases to show (default: the 13 happy-path phases). */
  readonly phases?: readonly CasePhase[]
  readonly className?: string
}

/** Compact horizontal case-phase progress. Stopped cases (cancelled / no-show) render muted. */
export function PhaseStepper({ phase, phases = PHASE_ORDER, className }: PhaseStepperProps) {
  const current = phaseIndex(phase)
  const stopped = current < 0
  return (
    <ol
      data-testid="case-phase-stepper"
      aria-label="Case phase"
      className={cn("flex w-full items-start overflow-x-auto pb-1", stopped && "opacity-50", className)}
    >
      {phases.map((step, index) => {
        const stepIndex = phaseIndex(step)
        const done = !stopped && stepIndex < current
        const active = !stopped && stepIndex === current
        return (
          <li
            key={step}
            aria-current={active ? "step" : undefined}
            className="group/step relative flex min-w-14 flex-1 flex-col items-center gap-1.5"
          >
            {index > 0 && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-2 right-1/2 h-px w-full -translate-y-1/2",
                  done || active ? "bg-primary/50" : "bg-border"
                )}
              />
            )}
            <span
              className={cn(
                "relative z-10 flex size-4 items-center justify-center rounded-full border text-[9px] transition-colors",
                done && "border-primary bg-primary text-primary-foreground",
                active && cn("border-transparent ring-4 ring-primary/15", PHASE_GROUP_DOT[PHASE_GROUP[step]]),
                !done && !active && "border-border bg-background"
              )}
            >
              {done && <CheckIcon aria-hidden className="size-2.5" strokeWidth={3} />}
            </span>
            <span
              className={cn(
                "max-w-20 text-center text-[10px] leading-tight",
                active ? "font-semibold text-foreground" : "text-muted-foreground",
                !active && "hidden lg:block"
              )}
            >
              {PHASE_LABEL[step]}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
