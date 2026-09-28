"use client";

import { ApiError } from "@asc/api-client";
import { useSetSurveillance } from "@asc/api-client/react";
import { surveillanceInterval } from "@asc/clinical-rules";
import { formatDate } from "@asc/clinical-rules/time";
import type { CasePathology } from "@asc/types";
import { Button, SectionCard, toast } from "@asc/ui";
import { CalendarCheck, LoaderCircle } from "@asc/ui/icons";

interface SurveillanceCardProps {
  readonly caseId: string;
  readonly pathology: CasePathology;
  readonly editable: boolean;
}

/** Next-colonoscopy interval from @asc/clinical-rules `surveillanceInterval` (USMSTF, simplified); clinician confirms. */
export function SurveillanceCard({ caseId, pathology, editable }: SurveillanceCardProps) {
  const set = useSetSurveillance(caseId);
  const pending = pathology.specimens.filter((specimen) => specimen.pathologyStatus === "pending").length;
  const recommendation = pathology.results.length > 0 ? surveillanceInterval(pathology.results) : null;
  const plan = pathology.surveillance;

  const onSet = () =>
    recommendation &&
    set.mutate(
      { intervalYears: recommendation.intervalYears, rationale: recommendation.rationale },
      {
        onSuccess: () => toast.success(`Surveillance set: ${recommendation.intervalYears} years`),
        onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not set surveillance"),
      },
    );

  return (
    <SectionCard title="Surveillance interval" description={recommendation?.guideline ?? "Calculated from pathology."} data-testid="pathology-surveillance">
      {plan ? (
        <div className="space-y-1">
          <p className="text-2xl font-semibold tracking-tight" data-testid="pathology-surveillance-set">
            {plan.intervalYears} years
          </p>
          <p className="text-sm text-muted-foreground">{plan.rationale}</p>
          <p className="text-sm">
            Next colonoscopy due <span className="font-medium">{formatDate(plan.dueDate)}</span> · set by {plan.setBy.name}
          </p>
        </div>
      ) : recommendation ? (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Recommended</p>
            <p className="text-2xl font-semibold tracking-tight" data-testid="pathology-surveillance-recommended">
              {recommendation.intervalYears} years
            </p>
            <p className="text-sm text-muted-foreground">{recommendation.rationale}</p>
          </div>
          {pending > 0 && <p className="text-xs text-warning">{pending} specimen(s) still pending — the interval may change.</p>}
          {editable && (
            <Button onClick={onSet} disabled={set.isPending || pending > 0} data-testid="pathology-surveillance-button">
              {set.isPending ? <LoaderCircle className="animate-spin" /> : <CalendarCheck />}
              Set {recommendation.intervalYears}-year surveillance
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Available once a pathology result is received.</p>
      )}
    </SectionCard>
  );
}
