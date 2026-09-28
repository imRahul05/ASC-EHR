"use client";

import { useCase } from "@asc/api-client/react";
import { ErrorState, LoadingSkeleton } from "@asc/ui";
import { CheckInCard } from "../pre-op/check-in-card";
import { ConsentsCard } from "../pre-op/consents-card";
import { PreOpChecklistCard } from "../pre-op/preop-checklist-card";
import { ReadinessCard } from "../pre-op/readiness-card";
import { VitalsCard } from "../pre-op/vitals-card";

interface PreOpTabProps {
  readonly caseId: string;
}

/** Pre-op: check-in, readiness gate, NPO / IV / escort, vitals, consents with signature. */
export function PreOpTab({ caseId }: PreOpTabProps) {
  const query = useCase(caseId);
  if (query.isPending) return <LoadingSkeleton variant="detail" />;
  if (query.isError) {
    return <ErrorState title="Could not load pre-op" message="Check your connection and try again." onRetry={() => void query.refetch()} />;
  }
  const detail = query.data;
  return (
    <div className="space-y-4" data-testid="case-tab-pre-op" data-case-id={caseId}>
      <CheckInCard detail={detail} />
      <ReadinessCard detail={detail} />
      <PreOpChecklistCard detail={detail} />
      <ConsentsCard detail={detail} />
      <VitalsCard caseId={caseId} vitals={detail.vitals} />
    </div>
  );
}
