import { bbpsAdequate, bbpsTotal, WITHDRAWAL_BENCHMARK_MIN, withdrawalMinutes } from "@asc/clinical-rules";
import type { CaseDetail } from "@asc/types";
import { cn } from "@asc/ui";
import { CircleCheck, CircleMinus, TriangleAlert, type LucideIcon } from "@asc/ui/icons";

interface QualityStripProps {
  readonly detail: CaseDetail;
}

type Tone = "ok" | "warn" | "missing";

const TONE: Readonly<Record<Tone, { readonly icon: LucideIcon; readonly className: string; readonly word: string }>> = {
  ok: { icon: CircleCheck, className: "text-success", word: "meets target" },
  warn: { icon: TriangleAlert, className: "text-warning", word: "below target" },
  missing: { icon: CircleMinus, className: "text-muted-foreground", word: "not documented" },
};

/** Colonoscopy quality measures the note reports: withdrawal time, BBPS, cecal intubation. */
export function QualityStrip({ detail }: QualityStripProps) {
  if (detail.case.procedure === "EGD") return null;
  const withdrawal = withdrawalMinutes(detail.events);
  const bbps = detail.case.bbps;
  const cecum = detail.events.some((event) => event.type === "CECUM_REACHED");
  const items: readonly { readonly id: string; readonly label: string; readonly value: string; readonly target: string; readonly tone: Tone }[] = [
    {
      id: "withdrawal",
      label: "Withdrawal time",
      value: withdrawal === null ? "—" : `${withdrawal} min`,
      target: `≥ ${WITHDRAWAL_BENCHMARK_MIN} min`,
      tone: withdrawal === null ? "missing" : withdrawal >= WITHDRAWAL_BENCHMARK_MIN ? "ok" : "warn",
    },
    {
      id: "bbps",
      label: "Bowel prep (BBPS)",
      value: bbps ? `${bbpsTotal(bbps)}/9 (R${bbps.right} T${bbps.transverse} L${bbps.left})` : "—",
      target: "≥ 6, each ≥ 2",
      tone: !bbps ? "missing" : bbpsAdequate(bbps) ? "ok" : "warn",
    },
    { id: "cecum", label: "Cecal intubation", value: cecum ? "Yes" : "—", target: "photo-documented", tone: cecum ? "ok" : "missing" },
  ];
  return (
    <dl className="grid gap-3 @md:grid-cols-3" data-testid="note-quality-strip">
      {items.map((item) => {
        const { icon: Icon, className, word } = TONE[item.tone];
        return (
          <div key={item.id} className="rounded-xl border border-border bg-card px-4 py-3 shadow-xs" data-testid={`note-quality-${item.id}`} data-tone={item.tone}>
            <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{item.value}</dd>
            <dd className={cn("mt-0.5 flex items-center gap-1 text-xs", className)}>
              <Icon aria-hidden className="size-3.5" />
              {word} · target {item.target}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
