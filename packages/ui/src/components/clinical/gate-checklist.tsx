import type { RuleResult } from "@asc/types"
import { CircleCheck, CircleX } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "../../lib/utils"

export interface GateChecklistProps {
  readonly result: RuleResult
  readonly title?: ReactNode
  /** Shown when the gate passes and has no checklist. */
  readonly okLabel?: ReactNode
  readonly className?: string
}

/** Renders a RuleResult: every check (✓/✗) with the failing reason under each ✗. */
export function GateChecklist({ result, title, okLabel = "All checks passed", className }: GateChecklistProps) {
  const messages = new Map(result.reasons.map((reason) => [reason.code, reason.message]))
  const items =
    result.checks ?? result.reasons.map((reason) => ({ code: reason.code, label: reason.message, ok: false }))
  return (
    <div data-testid="gate-checklist" data-ok={result.ok} className={cn("space-y-2", className)}>
      {title && <p className="text-xs font-medium text-muted-foreground">{title}</p>}
      {items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-success">
          <CircleCheck aria-hidden className="size-4" /> {okLabel}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => {
            const message = messages.get(item.code)
            return (
              <li key={item.code} className="flex items-start gap-2 text-sm" data-ok={item.ok}>
                {item.ok ? (
                  <CircleCheck aria-label="Passed" className="mt-0.5 size-4 shrink-0 text-success" />
                ) : (
                  <CircleX aria-label="Failed" className="mt-0.5 size-4 shrink-0 text-destructive" />
                )}
                <span className="min-w-0">
                  <span className={cn(item.ok ? "text-muted-foreground" : "font-medium text-foreground")}>{item.label}</span>
                  {!item.ok && message && message !== item.label && (
                    <span className="block text-xs text-muted-foreground">{message}</span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
