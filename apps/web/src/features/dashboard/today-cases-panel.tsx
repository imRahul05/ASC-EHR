"use client";

import Link from "next/link";
import { useSchedule } from "@asc/api-client/react";
import { STOPPED_PHASES } from "@asc/clinical-rules";
import type { ProcedureCase, UserProfile } from "@asc/types";
import { Button, EmptyState, ErrorState, LoadingSkeleton, SectionCard } from "@asc/ui";
import { CalendarDays } from "@asc/ui/icons";
import { CaseRowLink } from "./case-row-link";

interface TodayCasesPanelProps {
  readonly user: UserProfile;
  /** `mine` = only cases where the user is the surgeon (surgeon slate). */
  readonly scope: "all" | "mine";
  readonly title: string;
}

const byStart = (a: ProcedureCase, b: ProcedureCase) => Date.parse(a.scheduledStart) - Date.parse(b.scheduledStart);

/** Today's cases (center-wide or the surgeon's slate), time-ordered, each opening the case workspace. */
export function TodayCasesPanel({ user, scope, title }: TodayCasesPanelProps) {
  const schedule = useSchedule();
  const cases = (schedule.data?.cases ?? [])
    .filter((item) => !STOPPED_PHASES.includes(item.phase))
    .filter((item) => scope === "all" || item.team.surgeon.id === user.id)
    .sort(byStart);

  return (
    <SectionCard
      title={title}
      description={schedule.data ? `${cases.length} case(s)` : undefined}
      actions={
        <Button variant="ghost" size="sm" render={<Link href="/schedule" />} nativeButton={false}>
          Schedule
        </Button>
      }
      contentClassName="p-2"
      data-testid="dashboard-today-cases"
    >
      {schedule.isPending && <LoadingSkeleton variant="table" rows={4} />}
      {schedule.isError && <ErrorState message="Could not load today's schedule." onRetry={() => void schedule.refetch()} />}
      {schedule.isSuccess && cases.length === 0 && (
        <EmptyState icon={CalendarDays} title="No cases today" description="Book a case from the schedule." className="py-8" />
      )}
      {cases.length > 0 && (
        <ul className="divide-y divide-border/60">
          {cases.map((item) => (
            <CaseRowLink key={item.id} procedureCase={item} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
