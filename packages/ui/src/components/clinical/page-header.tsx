import type { ReactNode } from "react"
import { cn } from "../../lib/utils"

export interface PageHeaderProps {
  readonly title: ReactNode
  readonly description?: ReactNode
  /** Small label above the title (e.g. section name). */
  readonly eyebrow?: ReactNode
  /** Right-aligned actions (buttons). */
  readonly actions?: ReactNode
  readonly className?: string
}

/** Top-of-page title block. */
export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow && <p className="text-xs font-medium text-muted-foreground">{eyebrow}</p>}
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
