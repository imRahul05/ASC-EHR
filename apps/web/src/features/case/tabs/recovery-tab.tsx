"use client";

import { useCase } from "@asc/api-client/react";
import { isPhaseAtLeast } from "@asc/clinical-rules";
import { formatTime24 } from "@asc/clinical-rules/time";
import type { CasePhase } from "@asc/types";
import { EmptyState, ErrorState, LoadingSkeleton } from "@asc/ui";
import { HeartPulse } from "@asc/ui/icons";
import { AldreteScorer } from "./recovery/aldrete-scorer";
import { DischargeInstructionsCard } from "./recovery/discharge-instructions-card";
import { DischargePanel } from "./recovery/discharge-panel";
import { PacuVitalsCard } from "./recovery/pacu-vitals-card";
import { PadssScorer } from "./recovery/padss-scorer";

interface RecoveryTabProps {
  readonly caseId: string;
}

/** Phases where PACU charting is open (after that the tab is a read-only record). */
const RECOVERY_PHASES: readonly CasePhase[] = ["RECOVERY", "READY_FOR_DISCHARGE"];

/** PACU: vitals, Aldrete (+ optional PADSS), AI discharge instructions, discharge gate and discharge. */
export function RecoveryTab({ caseId }: RecoveryTabProps) {
  const query = useCase(caseId);

  if (query.isPending) return <LoadingSkeleton variant="cards" />;
  if (query.isError) return <ErrorState message="Could not load recovery data." onRetry={() => void query.refetch()} />;

  const detail = query.data;
  const phase = detail.case.phase;
  if (!isPhaseAtLeast(phase, "RECOVERY")) {
    return (
      <div data-testid="case-tab-recovery" data-case-id={caseId}>
        <EmptyState icon={HeartPulse} title="Not in recovery yet" description="PACU charting opens when the procedure ends (scope out → End procedure)." />
      </div>
    );
  }

  const editable = RECOVERY_PHASES.includes(phase);
  const dischargedAt = detail.case.timestamps.DISCHARGED;

  return (
    <div className="space-y-4" data-testid="case-tab-recovery" data-case-id={caseId}>
      {dischargedAt && (
        <p className="rounded-lg border border-success/30 bg-success/8 px-3 py-2 text-sm text-success" role="status">
          Discharged at <span className="tabular-nums">{formatTime24(dischargedAt)}</span>. Recovery record is read-only.
        </p>
      )}
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <AldreteScorer key={detail.aldrete?.recordedAt ?? "none"} caseId={caseId} current={detail.aldrete} editable={editable} />
          {editable && <PadssScorer />}
        </div>
        {editable && <DischargePanel detail={detail} />}
      </div>
      <PacuVitalsCard caseId={caseId} vitals={detail.vitals} editable={editable} />
      <DischargeInstructionsCard caseId={caseId} instructions={detail.discharge} editable={editable} />
    </div>
  );
}
