import type { ComponentProps } from "react"
import { cn } from "../../lib/utils"

/** Keyboard key hint, e.g. <Kbd>⌘K</Kbd>. */
function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-md border border-border bg-muted px-1 font-sans text-[11px] font-medium text-muted-foreground select-none",
        className
      )}
      {...props}
    />
  )
}

export { Kbd }
