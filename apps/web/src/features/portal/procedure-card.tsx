"use client";

import { formatTime24, formatWeekday } from "@asc/clinical-rules/time";
import type { ProcedureCase } from "@asc/types";
import { SectionCard, useNow } from "@asc/ui";
import { CalendarHeart, Clock, MapPin } from "@asc/ui/icons";

const MINUTE_MS = 60_000;
const ARRIVE_EARLY_MIN = 60;

/** "in 3 days" / "in 5 hours" / "today" — calm, coarse countdown (no ticking seconds). */
function countdown(startIso: string, now: number): { readonly value: string; readonly unit: string } {
  const minutes = Math.round((Date.parse(startIso) - now) / MINUTE_MS);
  if (minutes <= 0) return { value: "Today", unit: "" };
  if (minutes < 60) return { value: String(minutes), unit: minutes === 1 ? "minute to go" : "minutes to go" };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { value: String(hours), unit: hours === 1 ? "hour to go" : "hours to go" };
  const days = Math.floor(hours / 24);
  return { value: String(days), unit: days === 1 ? "day to go" : "days to go" };
}

interface ProcedureCardProps {
  readonly procedureCase: ProcedureCase;
  readonly facilityName: string;
}

/** The patient's upcoming procedure: what, when to arrive, where, and a countdown. */
export function ProcedureCard({ procedureCase, facilityName }: ProcedureCardProps) {
  const now = useNow();
  const start = procedureCase.scheduledStart;
  const arrive = new Date(Date.parse(start) - ARRIVE_EARLY_MIN * MINUTE_MS).toISOString();
  const done = Date.parse(start) + procedureCase.durationMin * MINUTE_MS < now;
  const left = countdown(start, now);

  const facts = [
    { icon: CalendarHeart, label: "Date", value: formatWeekday(start) },
    { icon: Clock, label: "Please arrive at", value: formatTime24(arrive), hint: `procedure at ${formatTime24(start)}` },
    { icon: MapPin, label: "Where", value: facilityName, hint: "Check in at the front desk" },
  ];

  return (
    <SectionCard data-testid="portal-procedure-card" contentClassName="p-5 sm:p-6">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Your procedure</p>
          <h2 className="text-xl font-semibold tracking-tight">{procedureCase.procedureLabel}</h2>
          <p className="text-sm text-muted-foreground">with {procedureCase.team.surgeon.name}</p>
        </div>
        {!done && (
          <div className="rounded-xl bg-accent px-5 py-3 text-center" data-testid="portal-countdown">
            <p className="text-3xl font-semibold tracking-tight text-accent-foreground">{left.value}</p>
            {left.unit && <p className="text-xs text-muted-foreground">{left.unit}</p>}
          </div>
        )}
      </div>
      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
        {facts.map(({ icon: Icon, label, value, hint }) => (
          <div key={label} className="flex gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Icon className="size-4" aria-hidden />
            </span>
            <div>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm font-medium tabular-nums">{value}</dd>
              {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
            </div>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}
