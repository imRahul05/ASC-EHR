import { Circle, CircleCheck, CircleDashed, CircleX, LoaderCircle, type LucideIcon } from "lucide-react"
import { cn } from "../../lib/utils"

export type PipelineStepStatus = "pending" | "active" | "done" | "failed" | "skipped"

export interface PipelineStep {
  readonly id: string
  readonly label: string
  readonly status: PipelineStepStatus
  readonly hint?: string
  /** Steps sharing a `group` render side by side (parallel branches). */
  readonly group?: string
}

const STATUS_ICON: Readonly<Record<PipelineStepStatus, LucideIcon>> = {
  pending: Circle,
  active: LoaderCircle,
  done: CircleCheck,
  failed: CircleX,
  skipped: CircleDashed,
}

const STATUS_CLASS: Readonly<Record<PipelineStepStatus, string>> = {
  pending: "text-muted-foreground",
  active: "text-ai-foreground",
  done: "text-success",
  failed: "text-destructive",
  skipped: "text-muted-foreground",
}

const STATUS_TEXT: Readonly<Record<PipelineStepStatus, string>> = {
  pending: "waiting",
  active: "running",
  done: "done",
  failed: "failed",
  skipped: "skipped",
}

export interface PipelineStepsProps {
  readonly steps: readonly PipelineStep[]
  readonly className?: string
  readonly "aria-label"?: string
}

function StepItem({ step }: { readonly step: PipelineStep }) {
  const Icon = STATUS_ICON[step.status]
  return (
    <li
      data-testid={`pipeline-step-${step.id}`}
      data-status={step.status}
      className="flex min-w-0 items-start gap-2 text-sm"
    >
      <Icon
        aria-hidden
        className={cn("mt-0.5 size-4 shrink-0", STATUS_CLASS[step.status], step.status === "active" && "motion-safe:animate-spin")}
      />
      <span className="min-w-0">
        <span className={cn(step.status === "pending" || step.status === "skipped" ? "text-muted-foreground" : "font-medium")}>
          {step.label}
        </span>
        <span className="sr-only"> — {STATUS_TEXT[step.status]}</span>
        {step.hint && <span className="block text-xs text-muted-foreground">{step.hint}</span>}
      </span>
    </li>
  )
}

/**
 * Multi-step job progress (e.g. MindScript-style draft-first pipeline). Steps with the same `group`
 * are parallel branches and render in one row. Status = icon + text, not colour alone.
 */
export function PipelineSteps({ steps, className, "aria-label": ariaLabel = "Progress" }: PipelineStepsProps) {
  const rows: PipelineStep[][] = []
  for (const step of steps) {
    const last = rows.at(-1)
    if (step.group && last?.[0]?.group === step.group) last.push(step)
    else rows.push([step])
  }
  return (
    <ol aria-label={ariaLabel} data-testid="pipeline-steps" className={cn("space-y-2", className)}>
      {rows.map((row) =>
        row.length === 1 && row[0] ? (
          <StepItem key={row[0].id} step={row[0]} />
        ) : (
          <li key={row.map((step) => step.id).join("-")} className="border-l-2 border-border pl-3">
            <ol className="grid gap-2 sm:grid-cols-3">
              {row.map((step) => (
                <StepItem key={step.id} step={step} />
              ))}
            </ol>
          </li>
        )
      )}
    </ol>
  )
}
