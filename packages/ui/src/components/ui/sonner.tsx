"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, toast, type ToasterProps } from "sonner"

/** App-wide toast outlet (mount once). Fire toasts with `toast.success(...)` / `toast.error(...)` from @asc/ui. */
function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme()
  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="bottom-right"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "rounded-xl! border-border! bg-popover! text-popover-foreground! shadow-sm!",
          description: "text-muted-foreground!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
