import { CloudOff, CloudUpload, Wifi } from "lucide-react"
import { cn } from "../../lib/utils"

export interface OfflineQueueBadgeProps {
  readonly online: boolean
  /** Entries waiting to sync (AIMS / room tablet offline queue). */
  readonly queued: number
  readonly className?: string
}

/** Connection + offline-queue state for room tablets (ui-guidelines §4 "Offline"). Icon + text, not colour alone. */
export function OfflineQueueBadge({ online, queued, className }: OfflineQueueBadgeProps) {
  const Icon = !online ? CloudOff : queued > 0 ? CloudUpload : Wifi
  const text = !online ? `Offline · ${queued} queued` : queued > 0 ? `Syncing ${queued}…` : "Online · synced"
  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="offline-queue-badge"
      data-online={online}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium tabular-nums",
        !online ? "border-warning/40 bg-warning/10 text-warning" : "border-border bg-background text-muted-foreground",
        className
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {text}
    </span>
  )
}
