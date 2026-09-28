"use client"

import { WifiOff } from "lucide-react"
import { useOnlineStatus } from "../../hooks/use-online-status"
import { cn } from "../../lib/utils"

export interface OfflineBannerProps {
  /** Entries waiting to sync (room tablet / AIMS queue). Omit when the view has no queue. */
  readonly queuedCount?: number
  readonly className?: string
}

/** Shown only while the browser is offline; says data may be out of date and how many entries are queued. */
export function OfflineBanner({ queuedCount, className }: OfflineBannerProps) {
  const online = useOnlineStatus()
  if (online) return null
  return (
    <div
      role="status"
      data-testid="offline-banner"
      className={cn("flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning", className)}
    >
      <WifiOff aria-hidden className="size-4 shrink-0" />
      <span>
        You are offline — showing the last loaded data.
        {queuedCount !== undefined && ` ${queuedCount} ${queuedCount === 1 ? "entry" : "entries"} queued.`}
      </span>
    </div>
  )
}
