"use client";

import { useCase, useNote, usePathology } from "@asc/api-client/react";
import { isPhaseAtLeast } from "@asc/clinical-rules";
import { EmptyState, ErrorState, LoadingSkeleton, SectionCard } from "@asc/ui";
import { Microscope } from "@asc/ui/icons";
import { CloseCaseCard } from "./pathology/close-case-card";
import { ResultLettersCard } from "./pathology/result-letters-card";
import { SpecimenResults } from "./pathology/specimen-results";
import { SurveillanceCard } from "./pathology/surveillance-card";

interface PathologyTabProps {
  readonly caseId: string;
}

/** Pathology loop: results → reconcile to polyp → adenoma flag → surveillance interval → letters → close. */
export function PathologyTab({ caseId }: PathologyTabProps) {
  const caseQuery = useCase(caseId);
  const pathology = usePathology(caseId);
  const note = useNote(caseId);

  if (caseQuery.isPending || pathology.isPending) return <LoadingSkeleton variant="table" rows={3} />;
  if (caseQuery.isError || pathology.isError) {
    return <ErrorState message="Could not load pathology for this case." onRetry={() => void Promise.all([caseQuery.refetch(), pathology.refetch()])} />;
  }

  const detail = caseQuery.data;
  const data = pathology.data;
  const phase = detail.case.phase;
  const editable = phase !== "CLOSED" && isPhaseAtLeast(phase, "RECOVERY");

  if (data.specimens.length === 0) {
    return (
      <div data-testid="case-tab-pathology" data-case-id={caseId}>
        <EmptyState
          icon={Microscope}
          title="No specimens for this case"
          description={isPhaseAtLeast(phase, "IN_PROCEDURE") ? "No jars were logged — nothing to follow up." : "Specimens are logged in the procedure room."}
        />
      </div>
    );
  }

  const adenomas = data.results.filter((result) => result.isAdenoma).length;

  return (
    <div className="space-y-4" data-testid="case-tab-pathology" data-case-id={caseId}>
      <SectionCard
        title="Specimens & results"
        description={`${data.results.length}/${data.specimens.length} resulted${adenomas > 0 ? ` · ${adenomas} adenoma(s) — counts toward ADR` : ""}`}
        contentClassName="p-3"
      >
        <SpecimenResults caseId={caseId} pathology={data} findings={note.data?.findings ?? []} editable={editable} />
      </SectionCard>
      <div className="grid gap-4 lg:grid-cols-3">
        <SurveillanceCard caseId={caseId} pathology={data} editable={editable} />
        <ResultLettersCard detail={detail} pathology={data} editable={editable} />
        {phase === "EXPORTED" && <CloseCaseCard detail={detail} />}
        {phase !== "EXPORTED" && (
          <SectionCard title={phase === "CLOSED" ? "Case closed" : "Close case"} data-testid="pathology-close-info">
            <p className="text-sm text-muted-foreground">
              {phase === "CLOSED" ? "All follow-up is complete. The episode is closed." : "Closing opens after charges are exported (Coding tab)."}
            </p>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
