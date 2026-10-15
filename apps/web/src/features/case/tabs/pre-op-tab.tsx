"use client";

import { useState } from "react";
import { useCase } from "@asc/api-client/react";
import { Button, ErrorState, LoadingSkeleton } from "@asc/ui";
import { FileSignature, HeartPulse } from "@asc/ui/icons";
import { ConsentModal } from "../components/consent-modal";
import { PreopIntakeDrawer } from "../components/preop-intake-drawer";
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
  const [consentOpen, setConsentOpen] = useState(false);
  const [preopOpen, setPreopOpen] = useState(false);
  const query = useCase(caseId);

  if (query.isPending) return <LoadingSkeleton variant="detail" />;
  if (query.isError) {
    return <ErrorState title="Could not load pre-op" message="Check your connection and try again." onRetry={() => void query.refetch()} />;
  }
  const detail = query.data;
  const procedureCase = detail.case;

  return (
    <div className="space-y-4" data-testid="case-tab-pre-op" data-case-id={caseId}>
      <div className="flex flex-wrap gap-2.5 pb-1">
        <Button
          onClick={() => setConsentOpen(true)}
          className="min-h-11 flex items-center gap-1.5"
          data-testid="preop-open-consent-button"
        >
          <FileSignature className="size-4" aria-hidden />
          Sign Informed Consent
        </Button>
        <Button
          variant="outline"
          onClick={() => setPreopOpen(true)}
          className="min-h-11 flex items-center gap-1.5"
          data-testid="preop-open-intake-button"
        >
          <HeartPulse className="size-4" aria-hidden />
          Pre-Op Nursing Intake
        </Button>
      </div>

      <CheckInCard detail={detail} />
      <ReadinessCard detail={detail} />
      <PreOpChecklistCard detail={detail} />
      <ConsentsCard detail={detail} />
      <VitalsCard caseId={caseId} vitals={detail.vitals} />

      <ConsentModal
        caseId={caseId}
        open={consentOpen}
        onOpenChange={setConsentOpen}
        procedureName={procedureCase.procedureLabel}
        procedureCode={procedureCase.procedure}
        performingPhysicianName={procedureCase.team.surgeon.name}
        patientName={procedureCase.patient.displayName}
        onSuccess={() => void query.refetch()}
      />

      <PreopIntakeDrawer
        caseId={caseId}
        open={preopOpen}
        onOpenChange={setPreopOpen}
        patientName={procedureCase.patient.displayName}
        defaultEscort={detail.patient.escort}
        onSuccess={() => void query.refetch()}
      />
    </div>
  );
}
