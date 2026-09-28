"use client";

import { useSchedule } from "@asc/api-client/react";
import { isPhaseAtLeast, STOPPED_PHASES } from "@asc/clinical-rules";
import type { AsaClass, ProcedureCase, UserProfile } from "@asc/types";
import { Badge, EmptyState, ErrorState, LoadingSkeleton, SectionCard } from "@asc/ui";
import { Syringe } from "@asc/ui/icons";
import { CaseRowLink } from "./case-row-link";

type AsaBucket = AsaClass | "unset";

const BUCKETS: readonly { readonly key: AsaBucket; readonly label: string; readonly hint: string }[] = [
  { key: 4, label: "ASA IV", hint: "Severe systemic disease, constant threat to life" },
  { key: 3, label: "ASA III", hint: "Severe systemic disease" },
  { key: 2, label: "ASA II", hint: "Mild systemic disease" },
  { key: 1, label: "ASA I", hint: "Healthy" },
  { key: "unset", label: "Not assessed", hint: "H&P / ASA pending" },
];

const bucketOf = (item: ProcedureCase): AsaBucket => item.asa ?? "unset";

interface AsaQueuePanelProps {
  readonly user: UserProfile;
}

/** Anesthesia queue: today's upcoming cases grouped by ASA class (highest risk first); own cases marked. */
export function AsaQueuePanel({ user }: AsaQueuePanelProps) {
  const schedule = useSchedule();
  const queue = (schedule.data?.cases ?? [])
    .filter((item) => !STOPPED_PHASES.includes(item.phase) && !isPhaseAtLeast(item.phase, "RECOVERY"))
    .sort((a, b) => Date.parse(a.scheduledStart) - Date.parse(b.scheduledStart));

  return (
    <SectionCard title="Anesthesia queue" description="Upcoming cases by ASA class" contentClassName="p-2" data-testid="dashboard-asa-queue">
      {schedule.isPending && <LoadingSkeleton variant="table" rows={4} />}
      {schedule.isError && <ErrorState message="Could not load the queue." onRetry={() => void schedule.refetch()} />}
      {schedule.isSuccess && queue.length === 0 && <EmptyState icon={Syringe} title="Queue is empty" description="No upcoming sedation cases today." className="py-8" />}
      <div className="space-y-3">
        {BUCKETS.map((bucket) => {
          const cases = queue.filter((item) => bucketOf(item) === bucket.key);
          if (cases.length === 0) return null;
          return (
            <section key={bucket.key} aria-label={bucket.label}>
              <h3 className="flex items-baseline gap-2 px-2 pt-1 text-xs font-semibold">
                {bucket.label} <span className="font-normal text-muted-foreground">{bucket.hint}</span>
              </h3>
              <ul className="divide-y divide-border/60">
                {cases.map((item) => (
                  <CaseRowLink
                    key={item.id}
                    procedureCase={item}
                    meta={item.team.anesthesia.id === user.id ? <Badge variant="outline">Mine</Badge> : undefined}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </SectionCard>
  );
}
