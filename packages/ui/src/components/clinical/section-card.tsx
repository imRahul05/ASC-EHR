import type { ReactNode } from "react"
import { cn } from "../../lib/utils"

export interface SectionCardProps {
  readonly title?: ReactNode
  readonly description?: ReactNode
  /** Right side of the header (buttons, badges). */
  readonly actions?: ReactNode
  readonly footer?: ReactNode
  readonly children: ReactNode
  readonly className?: string
  readonly contentClassName?: string
  readonly "data-testid"?: string
}

/** Hairline-bordered surface with an optional header row — the default container for a block of a screen. */
export function SectionCard({
  title,
  description,
  actions,
  footer,
  children,
  className,
  contentClassName,
  "data-testid": testId,
}: SectionCardProps) {
  const hasHeader = title !== undefined || actions !== undefined
  return (
    <section data-testid={testId} className={cn("rounded-xl border border-border bg-card text-card-foreground shadow-xs", className)}>
      {hasHeader && (
        <div className="flex items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div className="min-w-0 space-y-0.5">
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-4", contentClassName)}>{children}</div>
      {footer && <div className="flex items-center justify-end gap-2 border-t border-border/70 px-4 py-3">{footer}</div>}
    </section>
  )
}
