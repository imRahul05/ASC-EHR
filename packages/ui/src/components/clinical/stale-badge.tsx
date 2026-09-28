import { RefreshCw } from "lucide-react"
import { cn } from "../../lib/utils"

export interface StaleBadgeProps {
  /** A background refetch is running (old data still shown). */
  readonly refreshing?: boolean
  /** The data could not be refreshed (last refetch failed / channel down). */
  readonly stale?: boolean
  readonly className?: string
}

/** Small inline marker for data that is being refreshed or may be out of date. Renders nothing when fresh. */
export function StaleBadge({ refreshing = false, stale = false, className }: StaleBadgeProps) {
  if (!refreshing && !stale) return null
  return (
    <span
      role="status"
      data-testid="stale-badge"
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11px] font-medium",
        stale ? "border-warning/30 bg-warning/10 text-warning" : "border-border text-muted-foreground",
        className
      )}
    >
      <RefreshCw aria-hidden className={cn("size-3", refreshing && "animate-spin motion-reduce:animate-none")} />
      {stale ? "May be out of date" : "Updating…"}
    </span>
  )
}
