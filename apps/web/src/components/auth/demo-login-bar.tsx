"use client";

import { useState } from "react";
import { isApiMockingEnabled } from "@asc/config/public-env";
import type { DemoPersonaId } from "@asc/types";
import { Skeleton } from "@asc/ui/components/ui/skeleton";
import { toast } from "@asc/ui/components/ui/sonner";
import { cn } from "@asc/ui/lib/utils";
import { ArrowRight, Building2, HeartPulse, Loader2, ShieldPlus, Stethoscope, UserRound, type LucideIcon } from "@asc/ui/icons";
import { PERSONAS } from "../../lib/personas";
import { useAuth, useDemoPresets } from "../../hooks/use-auth";

/** Persona icons (labels and order live in lib/personas.ts, keyed by preset id). */
const PERSONA_ICON: Readonly<Record<DemoPersonaId, LucideIcon>> = {
  "demo-admin": Building2,
  "demo-nurse": HeartPulse,
  "demo-surgeon": Stethoscope,
  "demo-anesthesia": ShieldPlus,
  "demo-patient": UserRound,
};

/** One-click demo sign-in: a card per persona (all five roles). Export name kept for the login page. */
export function DemoLoginBar() {
  const isMocking = isApiMockingEnabled();
  const { loginWithDemo, isDemoLoggingIn } = useAuth();
  const presets = useDemoPresets();
  const [pendingId, setPendingId] = useState<DemoPersonaId | null>(null);

  if (!isMocking) {
    return null;
  }
  const ordered = (presets.data ?? []).toSorted(
    (a, b) => PERSONAS[a.id].order - PERSONAS[b.id].order,
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
          const persona = PERSONAS[preset.id];
          const Icon = PERSONA_ICON[preset.id];
          const pending = pendingId === preset.id;
          return (
            <li key={preset.id} className={cn(index === 0 && "sm:col-span-2")}>
              <button
                type="button"
                onClick={() => void signIn(preset.id)}
                disabled={isDemoLoggingIn}
                aria-label={`Sign in as ${persona.label} (${preset.fullName})`}
                data-testid={`demo-persona-${preset.id.replace("demo-", "")}`}
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
