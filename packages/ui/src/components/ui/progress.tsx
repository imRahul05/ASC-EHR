"use client"

import { Progress as ProgressPrimitive } from "@base-ui/react/progress"
import { cn } from "../../lib/utils"

const TONE_CLASS = {
  default: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  ai: "bg-ai-foreground",
} as const

interface ProgressProps extends ProgressPrimitive.Root.Props {
  readonly tone?: keyof typeof TONE_CLASS
}

function Progress({ className, tone = "default", ...props }: ProgressProps) {
  return (
    <ProgressPrimitive.Root data-slot="progress" className={cn("w-full", className)} {...props}>
      <ProgressPrimitive.Track className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <ProgressPrimitive.Indicator className={cn("h-full rounded-full transition-all", TONE_CLASS[tone])} />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  )
}

export { Progress }
