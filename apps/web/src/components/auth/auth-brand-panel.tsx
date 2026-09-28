import type { CasePhase } from "@asc/types";
import { AiBadge, PhaseChip } from "@asc/ui";
import { FileSignature, Lock, ScrollText } from "@asc/ui/icons";

const JOURNEY: readonly { readonly time: string; readonly label: string; readonly phase: CasePhase; readonly ai?: boolean }[] = [
  { time: "07:40", label: "Checked in · escort confirmed", phase: "ARRIVED" },
  { time: "08:05", label: "Readiness gate passed", phase: "READY_FOR_PROCEDURE" },
  { time: "08:12", label: "Time-out attested (MD · RN · CRNA)", phase: "IN_PROCEDURE" },
  { time: "08:41", label: "Procedure note drafted", phase: "RECOVERY", ai: true },
  { time: "09:20", label: "Aldrete 10 · discharged with escort", phase: "DISCHARGED" },
];

const PROMISES = [
  { icon: FileSignature, text: "AI drafts, clinicians sign" },
  { icon: ScrollText, text: "Every read and write audited" },
  { icon: Lock, text: "PHI stays in-session" },
] as const;

/** Calm right-hand panel on auth screens: one patient's day as a quiet timeline. */
export function AuthBrandPanel() {
  return (
    <aside aria-hidden className="relative hidden overflow-hidden border-l border-border bg-muted/40 lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div className="space-y-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">One patient · one morning</p>
        <p className="max-w-md text-3xl leading-tight font-semibold tracking-tight text-balance">
          Referral to recall, in one calm workspace.
        </p>
      </div>

      <ol className="my-10 max-w-md space-y-0 rounded-2xl border border-border bg-card p-2 shadow-sm">
        {JOURNEY.map((step) => (
          <li key={step.time} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            <span className="w-11 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{step.time}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{step.label}</span>
            {step.ai ? <AiBadge label="Draft" /> : <PhaseChip phase={step.phase} />}
          </li>
        ))}
      </ol>

      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        {PROMISES.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-2">
            <Icon className="size-4" /> {text}
          </li>
        ))}
      </ul>
    </aside>
  );
}
