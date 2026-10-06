"use client";

import { useState } from "react";
import type { DemoPersonaId, UserRole } from "@asc/types";
import { Skeleton } from "@asc/ui/components/ui/skeleton";
import { toast } from "@asc/ui/components/ui/sonner";
import { cn } from "@asc/ui/lib/utils";
import { ArrowRight, Building2, HeartPulse, Loader2, ShieldPlus, Stethoscope, UserRound, type LucideIcon } from "@asc/ui/icons";
import { useAuth, useDemoPresets } from "../../hooks/use-auth";

/** Persona labels from docs/product/07-mock-frontend.md §2 (display order = demo script order). */
const PERSONAS: Readonly<Record<UserRole, { readonly label: string; readonly icon: LucideIcon; readonly lands: string; readonly order: number }>> = {
  ADMIN: { label: "Front desk / Admin", icon: Building2, lands: "Center operations", order: 0 },
  NURSE: { label: "Nurse", icon: HeartPulse, lands: "Whiteboard", order: 1 },
  SURGEON: { label: "Gastroenterologist", icon: Stethoscope, lands: "Slate + sign queue", order: 2 },
  ANESTHESIOLOGIST: { label: "Anesthesia", icon: ShieldPlus, lands: "Anesthesia queue", order: 3 },
  PATIENT: { label: "Patient", icon: UserRound, lands: "My procedure", order: 4 },
};

/** One-click demo sign-in: a card per persona (all five roles). Export name kept for the login page. */
export function DemoLoginBar() {
  const { loginWithDemo, isDemoLoggingIn } = useAuth();
  const presets = useDemoPresets();
  const [pendingId, setPendingId] = useState<DemoPersonaId | null>(null);
  const ordered = (presets.data ?? []).toSorted(
    (a, b) => PERSONAS[a.role].order - PERSONAS[b.role].order,
  );

  const signIn = async (presetId: DemoPersonaId) => {
    setPendingId(presetId);
    try {
      await loginWithDemo(presetId);
    } catch {
      setPendingId(null);
      toast.error("Demo sign-in failed. Try again.");
    }
  };

  return (
    <section aria-labelledby="demo-personas-title" className="space-y-3" data-testid="demo-personas">
      <div className="flex items-baseline justify-between">
        <h2 id="demo-personas-title" className="text-sm font-medium">
          Explore as
        </h2>
        <span className="text-xs text-muted-foreground">One click · synthetic data</span>
      </div>
      {presets.isError && <p className="text-sm text-destructive">Demo accounts are unavailable — use email sign-in.</p>}
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {presets.isPending &&
          Array.from({ length: 5 }, (_, index) => (
            <li key={index}>
              <Skeleton className="h-[4.25rem] rounded-xl" />
            </li>
          ))}
        {ordered.map((preset, index) => {
          const persona = PERSONAS[preset.role];
          const Icon = persona.icon;
          const pending = pendingId === preset.id;
          return (
            <li key={preset.id} className={cn(index === 0 && "sm:col-span-2")}>
              <button
                type="button"
                onClick={() => void signIn(preset.id)}
                disabled={isDemoLoggingIn}
                aria-label={`Sign in as ${persona.label} (${preset.fullName})`}
                data-testid={`demo-persona-${preset.role.toLowerCase()}`}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left shadow-xs outline-none transition-colors motion-reduce:transition-none",
                  "hover:border-primary/40 hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-60",
                  pending && "border-primary/50 bg-accent/60",
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground group-hover:bg-card">
                  <Icon aria-hidden className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{persona.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {index === 0 ? `${preset.fullName} · ${persona.lands}` : preset.fullName.split(",")[0]}
                  </span>
                </span>
                {pending ? (
                  <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-primary" />
                ) : (
                  <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transition-none" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
