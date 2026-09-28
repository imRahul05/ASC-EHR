import { formatDateTime, formatTime24, toIsoDate, todayIsoDate } from "@asc/clinical-rules/time"
import { Circle, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "../../lib/utils"

const TONE_CLASS = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-accent text-accent-foreground",
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  ai: "bg-ai text-ai-foreground",
} as const

export interface TimelineItem {
  readonly id: string
  /** ISO time; rendered as 24 h clock (with the date when it is not today). */
  readonly at: string
  readonly title: ReactNode
  readonly description?: ReactNode
  readonly icon?: LucideIcon
  readonly tone?: keyof typeof TONE_CLASS
}

export interface TimelineProps {
  readonly items: readonly TimelineItem[]
  readonly className?: string
}

const timeLabel = (iso: string) => (toIsoDate(new Date(iso)) === todayIsoDate() ? formatTime24(iso) : formatDateTime(iso))

/** Vertical time-ordered list (procedure events, audit trail, phase history). */
export function Timeline({ items, className }: TimelineProps) {
  return (
    <ol data-testid="timeline" className={cn("relative space-y-4", className)}>
      {items.map((item, index) => {
        const Icon = item.icon ?? Circle
        return (
          <li key={item.id} className="relative flex gap-3">
            {index < items.length - 1 && <span aria-hidden className="absolute top-7 bottom-[-1rem] left-3.5 w-px bg-border" />}
            <span className={cn("relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full", TONE_CLASS[item.tone ?? "default"])}>
              <Icon aria-hidden className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <time dateTime={item.at} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {timeLabel(item.at)}
                </time>
              </div>
              {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
