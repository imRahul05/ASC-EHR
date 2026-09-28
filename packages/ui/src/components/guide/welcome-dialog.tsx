"use client"

import type { LucideIcon } from "lucide-react"
import { Sparkles } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "../ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog"

export interface WelcomeHighlight {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly icon?: LucideIcon
}

export interface WelcomeDialogProps {
  readonly open: boolean
  /** Called with `false` on Esc, outside click or the close button. */
  readonly onOpenChange: (open: boolean) => void
  readonly title: string
  readonly intro: ReactNode
  readonly highlights: readonly WelcomeHighlight[]
  /** Small print under the highlights (e.g. "Reloading the page signs you out"). */
  readonly note?: ReactNode
  readonly primaryLabel: string
  readonly onPrimary: () => void
  readonly secondaryLabel: string
  readonly onSecondary: () => void
}

/** First-run welcome: what this is, three things to try, and two ways in. Base UI dialog (focus trap, Esc closes). */
export function WelcomeDialog({
  open,
  onOpenChange,
  title,
  intro,
  highlights,
  note,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: WelcomeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogContent className="gap-5 sm:max-w-md" data-testid="welcome-dialog">
        <DialogHeader className="gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-primary" aria-hidden>
            <Sparkles className="size-4" />
          </span>
          <DialogTitle className="text-lg font-semibold tracking-tight">{title}</DialogTitle>
          <DialogDescription className="leading-relaxed">{intro}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-3" aria-label="What you can do">
          {highlights.map(({ id, title: itemTitle, description, icon: Icon = Sparkles }) => (
            <li key={id} className="flex gap-3">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground" aria-hidden>
                <Icon className="size-3.5" />
              </span>
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{itemTitle}</span>
                <span className="block text-xs leading-relaxed text-muted-foreground">{description}</span>
              </span>
            </li>
          ))}
        </ul>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onSecondary} data-testid="welcome-explore">
            {secondaryLabel}
          </Button>
          <Button onClick={onPrimary} data-testid="welcome-start-tour">
            {primaryLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
