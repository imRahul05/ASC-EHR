"use client";

import { isPhaseAtLeast, PHASE_ACTION_LABEL, readinessGate } from "@asc/clinical-rules";
import type { CaseDetail } from "@asc/types";
import { Button, GateChecklist, SectionCard } from "@asc/ui";
import { ArrowRight, CircleCheck } from "@asc/ui/icons";
import { useCaseTab } from "../use-case-tab";

interface ReadinessCardProps {
  readonly detail: CaseDetail;
}

/** Codes fixed on the Pre-procedure tab (H&P, ASA, holds). */
const PRE_PROCEDURE_CODES = new Set(["HP_CURRENT", "ASA_SET", "HOLDS_CONFIRMED"]);

/**
 * Live readiness gate (same rule the API re-checks). The advance action stays in the workspace
 * "Next" gate panel — this card only explains what is missing and where to fix it.
 */
export function ReadinessCard({ detail }: ReadinessCardProps) {
  const { setTab } = useCaseTab(detail.case.phase);
  const result = readinessGate(detail.case, detail.hp, detail.consents, detail.patient.medications);
  const needsPreProcedure = result.reasons.some((reason) => PRE_PROCEDURE_CODES.has(reason.code));
  const markedReady = isPhaseAtLeast(detail.case.phase, "READY_FOR_PROCEDURE");

  return (
    <SectionCard
      title="Readiness for procedure"
      description={
        result.ok ? (
          <span className="inline-flex items-center gap-1 text-success">
            <CircleCheck aria-hidden className="size-3.5" />
            {markedReady ? "Marked ready for the procedure." : `Ready — use “${PHASE_ACTION_LABEL.READY_FOR_PROCEDURE}” in the Next panel.`}
          </span>
        ) : (
          `${result.reasons.length} item(s) outstanding`
        )
      }
      actions={
        needsPreProcedure ? (
          <Button variant="outline" size="sm" className="min-h-11" onClick={() => setTab("pre-procedure")} data-testid="preop-open-pre-procedure">
            H&P & holds <ArrowRight aria-hidden />
          </Button>
        ) : undefined
      }
      data-testid="preop-readiness"
    >
      <GateChecklist result={result} />
    </SectionCard>
  );
}
