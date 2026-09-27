"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"

export interface ThemeToggleProps {
  readonly className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className={cn("text-muted-foreground hover:text-foreground", className)}
      aria-label="Toggle theme"
      data-testid="theme-toggle"
    >
      <Sun className="h-3.5 w-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  )
}
