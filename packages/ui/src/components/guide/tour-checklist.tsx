"use client"

import { ArrowRight, Check, ChevronDown, ChevronUp, LoaderCircle, Map as MapIcon, X } from "lucide-react"
import { useState, type ReactNode } from "react"
import { cn } from "../../lib/utils"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { Progress } from "../ui/progress"

export interface TourChecklistStep {
  readonly id: string
  readonly title: string
  readonly description: string
  /** Who does this step, e.g. "Nurse". */
  readonly badge: string
  readonly done: boolean
  /** Shown under the description when the step ticks itself from real app state. */
  readonly autoHint?: string
}

export interface TourChecklistProps {
  readonly steps: readonly TourChecklistStep[]
  readonly collapsed: boolean
  readonly onCollapsedChange: (collapsed: boolean) => void
  /** "Take me there". */
  readonly onGo: (stepId: string) => void
  readonly onToggleDone: (stepId: string, done: boolean) => void
  /** Hide the panel (the app decides how to resume). */
  readonly onDismiss: () => void
  /** Step whose "Take me there" is in flight (role switch + navigation). */
  readonly pendingStepId?: string | null
  readonly title?: string
  /** Shown above the list once every step is done. */
  readonly completeMessage?: ReactNode
  readonly className?: string
}

/**
 * Floating, collapsible checklist for a guided demo (bottom-right). One step open at a time;
 * defaults to the first step not done. Presentational: the app owns progress and navigation.
 */
export function TourChecklist({
  steps,
  collapsed,
  onCollapsedChange,
  onGo,
  onToggleDone,
  onDismiss,
  pendingStepId = null,
  title = "Demo tour",
  completeMessage,
  className,
}: TourChecklistProps) {
  const [openStepId, setOpenStepId] = useState<string | null>(null)
  const doneCount = steps.filter((step) => step.done).length
  const allDone = doneCount === steps.length
  const activeId = openStepId ?? steps.find((step) => !step.done)?.id ?? null
  const progressLabel = `${doneCount} of ${steps.length} done`

  if (collapsed) {
    return (
      <div className={cn("fixed right-4 bottom-4 z-40", className)}>
        <Button
          variant="outline"
          onClick={() => onCollapsedChange(false)}
          aria-expanded={false}
          aria-label={`${title}: ${progressLabel}. Open checklist`}
          className="h-9 gap-2 rounded-full bg-card pr-3 pl-3 shadow-sm"
          data-testid="tour-open"
        >
          <MapIcon className="size-3.5 text-primary" aria-hidden />
          <span className="text-xs font-medium">{title}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {doneCount}/{steps.length}
          </span>
          <ChevronUp className="size-3.5 text-muted-foreground" aria-hidden />
        </Button>
      </div>
    )
  }

  return (
    <section
      aria-label={title}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCollapsedChange(true)
      }}
      className={cn(
        "fixed right-4 bottom-4 z-40 flex max-h-[min(36rem,calc(100dvh-6rem))] w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm",
        className
      )}
      data-testid="tour-checklist"
    >
      <header className="space-y-2 border-b border-border/70 px-4 pt-3 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <MapIcon className="size-3.5 shrink-0 text-primary" aria-hidden />
            <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
          </div>
          <div className="flex shrink-0 items-center">
            <Button variant="ghost" size="icon-sm" onClick={() => onCollapsedChange(true)} aria-label="Minimise tour" aria-expanded data-testid="tour-collapse">
              <ChevronDown />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onDismiss} aria-label="Close tour" data-testid="tour-dismiss">
              <X />
            </Button>
          </div>
        </div>
        <Progress value={steps.length === 0 ? 0 : (doneCount / steps.length) * 100} aria-label="Tour progress" />
        <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
          {progressLabel}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {allDone && completeMessage && (
          <div className="border-b border-border/70 bg-success/8 px-4 py-3 text-xs leading-relaxed" data-testid="tour-complete">
            {completeMessage}
          </div>
        )}
        <ol className="divide-y divide-border/70">
          {steps.map((step, index) => {
            const open = step.id === activeId
            const pending = pendingStepId === step.id
            return (
              <li key={step.id} data-testid={`tour-step-${step.id}`} data-done={step.done || undefined}>
                <button
                  type="button"
                  onClick={() => setOpenStepId(open ? "" : step.id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none hover:bg-accent/50 focus-visible:bg-accent/60"
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums",
                      step.done ? "border-success/40 bg-success/10 text-success" : open ? "border-primary/50 text-primary" : "border-border text-muted-foreground"
                    )}
                    aria-hidden
                  >
                    {step.done ? <Check className="size-3" /> : index + 1}
                  </span>
                  <span className={cn("min-w-0 flex-1 truncate text-[13px] font-medium", step.done && "text-muted-foreground line-through decoration-muted-foreground/40")}>
                    {step.title}
                    <span className="sr-only">{step.done ? " (done)" : ""}</span>
                  </span>
                  <Badge variant="outline" className="shrink-0 text-[10px] font-normal text-muted-foreground">
                    {step.badge}
                  </Badge>
                </button>
                {open && (
                  <div className="space-y-3 px-4 pt-0.5 pb-3 pl-12">
                    <p className="text-xs leading-relaxed text-muted-foreground">{step.description}</p>
                    {step.autoHint && !step.done && <p className="text-[11px] text-muted-foreground/80">{step.autoHint}</p>}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={() => onGo(step.id)} disabled={pendingStepId !== null} data-testid={`tour-go-${step.id}`}>
                        {pending ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : null}
                        Take me there
                        {!pending && <ArrowRight />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => {
                          onToggleDone(step.id, !step.done)
                          // Marking done moves focus of the list on to the next open step.
                          if (!step.done) setOpenStepId(null)
                        }} data-testid={`tour-done-${step.id}`}>
                        {step.done ? "Mark not done" : "Mark done"}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
