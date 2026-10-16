"use client";

import { useCase } from "@asc/api-client/react";
import { isPhaseAtLeast, STOPPED_PHASES } from "@asc/clinical-rules/phases";
import type { CasePhase } from "@asc/types";
import { EmptyState, ErrorState, LoadingSkeleton, OfflineBanner, SectionCard } from "@asc/ui";
import { Syringe } from "@asc/ui/icons";
import { AirwayPanel } from "../anesthesia/airway-panel";
import { AnesthesiaHeader } from "../anesthesia/anesthesia-header";
import { DrugLog } from "../anesthesia/drug-log";
import { FlowsheetGrid } from "../anesthesia/flowsheet-grid";
import { PreAnesthesiaCard } from "../anesthesia/pre-anesthesia-card";
import { VitalsEntryForm } from "../anesthesia/vitals-entry-form";
import { VitalsTrends } from "../anesthesia/vitals-trends";

interface AnesthesiaTabProps {
  readonly caseId: string;
}

/** The anesthesia record is charted from the room until the patient leaves recovery. */
const CHARTING_PHASES: readonly CasePhase[] = ["READY_FOR_PROCEDURE", "IN_PROCEDURE", "RECOVERY"];

/** AIMS flowsheet: 5-min vitals grid + trends, drug administration with totals, airway/O₂, sedation start/end. */
export function AnesthesiaTab({ caseId }: AnesthesiaTabProps) {
  const query = useCase(caseId);

  if (query.isPending) return <LoadingSkeleton variant="detail" />;
  if (query.isError) {
    return <ErrorState title="Could not load the anesthesia record" message="Check your connection and try again." onRetry={() => void query.refetch()} />;
  }

  const detail = query.data;
  const { phase } = detail.case;
  if (STOPPED_PHASES.includes(phase) || !isPhaseAtLeast(phase, "PRE_OP")) {
    return (
      <div data-testid="case-tab-anesthesia">
        <EmptyState icon={Syringe} title="No anesthesia record yet" description="The anesthesia record opens once the patient arrives in pre-op." />
      </div>
    );
  }

  const isIntraOp = isPhaseAtLeast(phase, "READY_FOR_PROCEDURE");
  const editable = CHARTING_PHASES.includes(phase) || phase === "PRE_OP";
  const record = detail.anesthesia;

  return (
    <div className="@container space-y-4" data-testid="case-tab-anesthesia">
      <OfflineBanner />
      <PreAnesthesiaCard caseId={caseId} record={record} editable={editable} />
      {isIntraOp ? (
        <>
          <AnesthesiaHeader detail={detail} editable={editable} />
          <VitalsTrends vitals={record.vitals} />
          <SectionCard
            title="Flowsheet"
            description={`${record.vitals.length} vitals rows · 5-minute columns · 24 h time`}
            footer={editable ? undefined : <span className="text-xs text-muted-foreground">Record closed — read-only.</span>}
            data-testid="anesthesia-flowsheet-card"
          >
            <div className="space-y-4">
              <FlowsheetGrid record={record} live={phase === "IN_PROCEDURE"} />
              {editable && <VitalsEntryForm caseId={caseId} />}
            </div>
          </SectionCard>
          <div className="grid gap-4 @5xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <DrugLog record={record} editable={editable} />
            <AirwayPanel record={record} editable={editable} />
          </div>
        </>
      ) : (
        <SectionCard
          title="Intra-Operative Anesthesia Flowsheet"
          description="Awaiting patient transfer to procedure room"
          data-testid="anesthesia-preop-waiting-card"
        >
          <div className="py-6 text-center text-sm text-muted-foreground">
            Complete the pre-anesthesia medical evaluation above to satisfy clinical Hard Gate 2 (CMS 42 CFR § 416.42(a)). Intra-operative vitals, drug administration, and airway flowsheet charting activate upon patient transfer to the procedure room.
          </div>
        </SectionCard>
      )}
    </div>
  );
}
