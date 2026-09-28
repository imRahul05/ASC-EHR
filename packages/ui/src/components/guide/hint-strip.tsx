import { Lightbulb, X } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"

export interface HintStripProps {
  /** Lead-in, e.g. "How this tab works". */
  readonly title: string
  readonly children: ReactNode
  readonly onDismiss: () => void
  /** Optional link-style action, e.g. "More help". */
  readonly actionLabel?: string
  readonly onAction?: () => void
  readonly className?: string
  readonly "data-testid"?: string
}

/** Quiet one-line hint at the top of a section; dismissable. */
export function HintStrip({ title, children, onDismiss, actionLabel, onAction, className, "data-testid": testId = "hint-strip" }: HintStripProps) {
  return (
    <aside
      aria-label={title}
      className={cn("flex items-start gap-2.5 rounded-lg border border-dashed border-border bg-muted/30 py-2 pr-1.5 pl-3 text-xs", className)}
      data-testid={testId}
    >
      <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">{title}: </span>
        {children}
        {actionLabel && onAction && (
          <>
            {" "}
            <button
              type="button"
              onClick={onAction}
              className="rounded-sm font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
              data-testid={`${testId}-action`}
            >
              {actionLabel}
            </button>
          </>
        )}
      </p>
      <Button variant="ghost" size="icon-xs" onClick={onDismiss} aria-label={`Hide: ${title}`} className="-my-0.5 text-muted-foreground" data-testid={`${testId}-dismiss`}>
        <X />
      </Button>
    </aside>
  )
}
