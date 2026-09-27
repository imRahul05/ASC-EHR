import { ArrowDownRight, ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "../../lib/utils"
import { Skeleton } from "../ui/skeleton"

const TONE_CLASS = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  ai: "text-ai-foreground",
} as const

const TREND_ICON: Readonly<Record<"up" | "down" | "flat", LucideIcon>> = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: ArrowRight,
}

export interface StatCardProps {
  readonly label: string
  readonly value: ReactNode
  readonly hint?: ReactNode
  readonly icon?: LucideIcon
  readonly tone?: keyof typeof TONE_CLASS
  /** Direction + short label, e.g. `{ direction: "up", label: "+2.1 pts vs 30d" }`. */
  readonly trend?: { readonly direction: "up" | "down" | "flat"; readonly label: string; readonly positive?: boolean }
  readonly isLoading?: boolean
  readonly className?: string
}

/** Single metric tile: label, large tabular value, hint and optional trend. */
export function StatCard({ label, value, hint, icon: Icon, tone = "default", trend, isLoading = false, className }: StatCardProps) {
  const TrendIcon = trend ? TREND_ICON[trend.direction] : null
  return (
    <div data-testid="stat-card" className={cn("rounded-xl border border-border bg-card p-4 shadow-xs", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {Icon && <Icon aria-hidden className="size-4 text-muted-foreground" />}
      </div>
      {isLoading ? (
        <Skeleton className="mt-2 h-7 w-20" />
      ) : (
        <p className={cn("mt-1.5 text-2xl font-semibold tracking-tight tabular-nums", TONE_CLASS[tone])}>{value}</p>
      )}
      {(hint || trend) && (
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {trend && TrendIcon && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                trend.positive === undefined ? "text-muted-foreground" : trend.positive ? "text-success" : "text-destructive"
              )}
            >
              <TrendIcon aria-hidden className="size-3.5" />
              {trend.label}
            </span>
          )}
          {hint && <span className="truncate">{hint}</span>}
        </div>
      )}
    </div>
  )
}
