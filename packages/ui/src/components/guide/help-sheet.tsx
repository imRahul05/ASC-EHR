"use client"

import { ArrowRight, FlaskConical, Server } from "lucide-react"
import type { ReactNode } from "react"
import { Badge } from "../ui/badge"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "../ui/sheet"

export interface HelpRecordLink {
  readonly id: string
  readonly label: string
  readonly hint?: string
  readonly onSelect: () => void
}

export interface HelpSheetProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly title: string
  /** Small label above the title, e.g. "Help · this page". */
  readonly eyebrow?: string
  /** One or two sentences: what this screen is for. */
  readonly purpose: string
  /** "Try this" — short imperative steps, in order. */
  readonly steps: readonly string[]
  /** Demo records worth opening here. */
  readonly records?: readonly HelpRecordLink[]
  /** Who sees this screen (labels). */
  readonly roles: readonly string[]
  /** What the demo fakes. */
  readonly mocked: string
  /** How production does it. */
  readonly production: string
  /** Extra actions (restart tour, open help center…). */
  readonly footer?: ReactNode
}

function SectionTitle({ children }: { readonly children: ReactNode }) {
  return <h3 className="text-xs font-medium text-muted-foreground">{children}</h3>
}

/** Right-side contextual help for the current screen. Base UI dialog underneath: focus trap, Esc closes. */
export function HelpSheet({ open, onOpenChange, title, eyebrow, purpose, steps, records = [], roles, mocked, production, footer }: HelpSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(next) => onOpenChange(next)}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md" data-testid="help-sheet">
        <SheetHeader className="gap-1 border-b border-border/70 pr-12">
          {eyebrow && <p className="text-[11px] font-medium text-primary">{eyebrow}</p>}
          <SheetTitle className="text-base font-semibold tracking-tight">{title}</SheetTitle>
          <SheetDescription className="leading-relaxed">{purpose}</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4">
          <section className="space-y-2" aria-labelledby="help-try-title">
            <SectionTitle>
              <span id="help-try-title">Try this</span>
            </SectionTitle>
            <ol className="space-y-2">
              {steps.map((step, index) => (
                <li key={step} className="flex gap-2.5 text-sm leading-relaxed">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-accent-foreground tabular-nums" aria-hidden>
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>

          {records.length > 0 && (
            <section className="space-y-2">
              <SectionTitle>Demo records to open</SectionTitle>
              <ul className="space-y-1.5">
                {records.map((record) => (
                  <li key={record.id}>
                    <button
                      type="button"
                      onClick={record.onSelect}
                      className="group flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-left outline-none hover:border-primary/40 hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/40"
                      data-testid={`help-record-${record.id}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{record.label}</span>
                        {record.hint && <span className="block text-xs text-muted-foreground">{record.hint}</span>}
                      </span>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-2">
            <SectionTitle>Who sees this</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {roles.map((role) => (
                <Badge key={role} variant="outline" className="font-normal">
                  {role}
                </Badge>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <SectionTitle>Demo vs production</SectionTitle>
            <dl className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed">
              <div className="flex gap-2">
                <dt className="flex shrink-0 items-center gap-1.5 font-medium text-foreground">
                  <FlaskConical className="size-3.5 text-muted-foreground" aria-hidden />
                  Demo
                </dt>
                <dd className="text-muted-foreground">{mocked}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="flex shrink-0 items-center gap-1.5 font-medium text-foreground">
                  <Server className="size-3.5 text-muted-foreground" aria-hidden />
                  Live
                </dt>
                <dd className="text-muted-foreground">{production}</dd>
              </div>
            </dl>
          </section>
        </div>

        {footer && <SheetFooter className="mt-0 flex-row flex-wrap border-t border-border/70">{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  )
}
