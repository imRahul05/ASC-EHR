import { cn } from "../../lib/utils"
import { Skeleton } from "../ui/skeleton"

export interface LoadingSkeletonProps {
  /** Shape of the final layout. */
  readonly variant?: "page" | "table" | "cards" | "detail"
  readonly rows?: number
  readonly className?: string
}

const range = (count: number) => Array.from({ length: count }, (_, index) => index)

/** Skeleton of the final layout (no spinners over blank areas). */
export function LoadingSkeleton({ variant = "page", rows = 5, className }: LoadingSkeletonProps) {
  return (
    <div data-testid="loading-skeleton" aria-busy="true" aria-live="polite" className={cn("space-y-4", className)}>
      {(variant === "page" || variant === "detail") && (
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-72" />
        </div>
      )}
      {(variant === "page" || variant === "cards") && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {range(4).map((index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
      )}
      {variant === "detail" && <Skeleton className="h-20 rounded-xl" />}
      {(variant === "page" || variant === "table" || variant === "detail") && (
        <div className="space-y-2 rounded-xl border border-border p-4">
          {range(rows).map((index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      )}
    </div>
  )
}
