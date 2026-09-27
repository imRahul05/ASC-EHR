import { Sparkles } from "lucide-react"
import { cn } from "../../lib/utils"

export interface AiBadgeProps {
  readonly label?: string
  readonly className?: string
}

/** Marks an AI-produced value (violet tint + icon + text). */
export function AiBadge({ label = "AI draft", className }: AiBadgeProps) {
  return (
    <span
      data-testid="ai-badge"
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-full border border-ai-border bg-ai px-2 text-[11px] font-medium whitespace-nowrap text-ai-foreground",
        className
      )}
    >
      <Sparkles aria-hidden className="size-3" />
      {label}
    </span>
  )
}
