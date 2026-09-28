"use client";

import Link from "next/link";
import { useCodingQueue, useDashboardSummary, useQualityMetrics, useSchedule } from "@asc/api-client/react";
import { STOPPED_PHASES } from "@asc/clinical-rules";
import { Progress, SectionCard } from "@asc/ui";

/** Staffed room day used as the utilization denominator (block template 07:00–15:00). */
const ROOM_DAY_MIN = 8 * 60;
const pct = (value: number) => `${Math.round(value * 100)} %`;

/** Center operations: room utilization + the back-office pipeline (unsigned → unbilled → pending path). */
export function CenterOpsPanel() {
  const schedule = useSchedule();
  const summary = useDashboardSummary();
  const quality = useQualityMetrics();
  const coding = useCodingQueue();
  const rooms = schedule.data?.rooms ?? [];
  const cases = (schedule.data?.cases ?? []).filter((item) => !STOPPED_PHASES.includes(item.phase));
  const unbilled = (coding.data ?? []).filter((item) => item.status !== "exported").length;

  const pipeline = [
    { label: "Unsigned notes", value: summary.data?.pendingSignatures, href: "/worklist?type=sign_note" },
    { label: "Unbilled cases", value: coding.data ? unbilled : undefined, href: "/coding" },
    { label: "Pending pathology", value: summary.data?.pendingPathology, href: "/pathology" },
    { label: "Avg turnover", value: quality.data ? `${Math.round(quality.data.current.turnaroundMin)} min` : undefined, href: "/quality" },
  ];

  return (
    <SectionCard title="Center operations" description="Rooms today and the back-office pipeline" data-testid="dashboard-center-ops">
      <div className="space-y-5">
        <ul className="space-y-3" aria-label="Room utilization">
          {rooms.map((room) => {
            const booked = cases.filter((item) => item.roomId === room.id).reduce((sum, item) => sum + item.durationMin, 0);
            const ratio = Math.min(1, booked / ROOM_DAY_MIN);
            return (
              <li key={room.id} className="space-y-1">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{room.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {booked} / {ROOM_DAY_MIN} min · {pct(ratio)}
                  </span>
                </div>
                <Progress value={ratio * 100} aria-label={`${room.name} utilization ${pct(ratio)}`} />
              </li>
            );
          })}
          {schedule.isPending && <li className="text-sm text-muted-foreground">Loading rooms…</li>}
        </ul>
        <dl className="grid grid-cols-2 gap-2">
          {pipeline.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="rounded-lg border border-border/70 p-3 outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums">{item.value ?? "–"}</dd>
            </Link>
          ))}
        </dl>
      </div>
    </SectionCard>
  );
}
