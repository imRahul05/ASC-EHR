"use client";

import { useCase } from "@asc/api-client/react";
import type { CaseDetail } from "@asc/types";
import { ErrorState, LoadingSkeleton } from "@asc/ui";
import { AllergiesCard } from "../pre-procedure/allergies-card";
import { HpExamCard } from "../pre-procedure/hp-exam-card";
import { MedicationHoldsCard } from "../pre-procedure/medication-holds-card";
import { PrevisitBriefCard } from "../pre-procedure/previsit-brief-card";
import { useHpForm } from "../pre-procedure/use-hp-form";

interface PreProcedureTabProps {
  readonly caseId: string;
}

/** Pre-procedure: AI pre-visit brief → allergies → medications with hold rules → H&P exam, ASA/Mallampati, sign. */
export function PreProcedureTab({ caseId }: PreProcedureTabProps) {
  const query = useCase(caseId);
  if (query.isPending) return <LoadingSkeleton variant="detail" />;
  if (query.isError) {
    return <ErrorState title="Could not load the H&P" message="Check your connection and try again." onRetry={() => void query.refetch()} />;
  }
  return <PreProcedureContent detail={query.data} />;
}

function PreProcedureContent({ detail }: { readonly detail: CaseDetail }) {
  const form = useHpForm(detail.hp);
  const brief = detail.hp?.brief ?? null;
  const signed = detail.hp?.status === "signed";
  const history = form.watch("intervalHistory");
  const included = brief !== null && history.includes(brief.summary);

  const insertBrief = (focus: boolean) => {
    if (!brief) return;
    const current = form.getValues("intervalHistory").trim();
    form.setValue("intervalHistory", current ? `${current}\n\n${brief.summary}` : brief.summary, { shouldDirty: true });
    if (focus) form.setFocus("intervalHistory");
  };

  return (
    <div className="space-y-4" data-testid="case-tab-pre-procedure" data-case-id={detail.case.id}>
      <PrevisitBriefCard
        brief={brief}
        patient={detail.patient}
        indication={detail.case.indication}
        included={included}
        disabled={signed}
        onAccept={() => insertBrief(false)}
        onEdit={() => insertBrief(true)}
      />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <AllergiesCard allergies={detail.patient.allergies} />
        <MedicationHoldsCard
          caseId={detail.case.id}
          medications={detail.patient.medications}
          scheduledStart={detail.case.scheduledStart}
          holdsReviewed={detail.hp?.holdsReviewed ?? false}
          locked={signed}
        />
      </div>
      <HpExamCard detail={detail} form={form} briefSummary={brief?.summary ?? null} />
    </div>
  );
}
