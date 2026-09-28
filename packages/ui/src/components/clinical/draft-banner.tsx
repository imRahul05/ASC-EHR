import { CircleCheckBig, LoaderCircle, Sparkles } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "../../lib/utils"

const STATE_COPY = {
  streaming: { title: "Generating draft…", body: "AI is writing. You can cancel at any time.", Icon: LoaderCircle },
  draft: { title: "AI draft — review before signing", body: "Nothing is final until a clinician signs.", Icon: Sparkles },
  signed: { title: "Signed", body: "This document is signed and locked.", Icon: CircleCheckBig },
} as const

export interface DraftBannerProps {
  readonly state: keyof typeof STATE_COPY
  /** Override the default body text. */
  readonly message?: ReactNode
  /** Secondary info, e.g. elapsed time `0:12`. */
  readonly meta?: ReactNode
  /** Cancel / retry / sign buttons. */
  readonly actions?: ReactNode
  readonly className?: string
}

/** Visible AI state for a draft document (streaming → draft → signed). */
export function DraftBanner({ state, message, meta, actions, className }: DraftBannerProps) {
  const { title, body, Icon } = STATE_COPY[state]
  const signed = state === "signed"
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="draft-banner"
      data-state={state}
      className={cn(
        "flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        signed ? "border-success/30 bg-success/8" : "border-ai-border bg-ai",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", signed ? "text-success" : "text-ai-foreground", state === "streaming" && "animate-spin")} />
        <div className="space-y-0.5">
          <p className={cn("text-sm font-medium", signed ? "text-success" : "text-ai-foreground")}>
            {title}
            {meta && <span className="ml-2 font-normal tabular-nums text-muted-foreground">{meta}</span>}
          </p>
          <p className="text-xs text-muted-foreground">{message ?? body}</p>
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
