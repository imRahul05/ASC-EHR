"use client";

import Link from "next/link";
import { Activity, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@asc/ui";

interface AuthLayoutProps {
  readonly children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Auth Top Header */}
      <header className="border-b border-border/80 px-6 py-3.5 flex items-center justify-between">
        <Link href="/login" className="flex items-center gap-2.5 group">
          <div className="p-1.5 rounded-lg bg-foreground text-background">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight text-foreground">
                ASC EHR
              </span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 bg-muted text-muted-foreground rounded">
                GI Suite
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Ambulatory Surgery Center Clinical System
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Toggle theme"
          >
            <Sun className="h-3.5 w-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-2xl">{children}</div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 py-3 px-6 text-center text-xs text-muted-foreground">
        <p>
          Protected Health Information (PHI) Secure Station • HIPAA Compliant Access Control • ASC EHR v0.1.0
        </p>
      </footer>
    </div>
  );
}
