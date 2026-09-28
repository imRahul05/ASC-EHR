import { CircleAlert, RotateCw } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"

export interface ErrorStateProps {
  readonly title?: ReactNode
  /** User-safe message (from ApiError.message/code — never raw server text or PHI). */
  readonly message?: ReactNode
  readonly onRetry?: () => void
  readonly className?: string
}

export function ErrorState({ title = "Something went wrong", message, onRetry, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      data-testid="error-state"
      className={cn("flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center", className)}
    >
      <CircleAlert aria-hidden className="size-6 text-destructive" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {message && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{message}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} data-testid="error-retry">
          <RotateCw aria-hidden /> Try again
        </Button>
      )}
    </div>
  )
}
