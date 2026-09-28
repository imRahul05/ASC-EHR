"use client";

import { useState } from "react";
import { useCase, useCoding, useNote, usePathology } from "@asc/api-client/react";
import type { EvidenceRef } from "@asc/types";
import { EmptyState, ErrorState, LoadingSkeleton, ProvenanceChip, SectionCard } from "@asc/ui";
import { Quote, Receipt, X } from "@asc/ui/icons";
import { AttestCard } from "./coding/attest-card";
import { ChargeExportCard } from "./coding/charge-export-card";
import { evidenceKey, resolveEvidence } from "./coding/evidence";
import { SuggestionTable } from "./coding/suggestion-table";

interface CodingTabProps {
  readonly caseId: string;
}

/** AI coding review: suggestions (exceptions first) with evidence, coder attestation, charge export. */
export function CodingTab({ caseId }: CodingTabProps) {
  const [evidence, setEvidence] = useState<EvidenceRef | null>(null);
  const caseQuery = useCase(caseId);
  const coding = useCoding(caseId);
  const note = useNote(caseId);
  const pathology = usePathology(caseId);

  if (coding.isPending || caseQuery.isPending) return <LoadingSkeleton variant="table" />;
  if (coding.isError || caseQuery.isError) {
    return <ErrorState message="Could not load coding for this case." onRetry={() => void Promise.all([coding.refetch(), caseQuery.refetch()])} />;
  }

  const data = coding.data;
  const detail = caseQuery.data;
  if (data.status === "not_ready" || data.suggestions.length === 0) {
    return (
      <div data-testid="case-tab-coding" data-case-id={caseId}>
        <EmptyState icon={Receipt} title="No coding suggestions yet" description="The coding agent runs when the procedure note is generated. Generate the note on the Note tab." />
      </div>
    );
  }

  const locked = data.status === "attested" || data.status === "exported";
  const activeKey = evidence ? evidenceKey(evidence) : null;
  const evidenceText = evidence ? resolveEvidence(evidence, { detail, note: note.data, pathology: pathology.data }) : undefined;

  return (
    <div className="space-y-4" data-testid="case-tab-coding" data-case-id={caseId}>
      <SectionCard
        title="Code suggestions"
        description="Lowest confidence and unreviewed first. Click an evidence link to see the source text."
        actions={data.provenance ? <ProvenanceChip provenance={data.provenance} /> : undefined}
        contentClassName="space-y-3 p-3"
      >
        {evidence && (
          <figure role="status" aria-live="polite" className="relative rounded-lg border border-ai-border bg-ai p-3 pr-9" data-testid="coding-evidence-panel">
            <figcaption className="flex items-center gap-1.5 text-xs font-medium text-ai-foreground">
              <Quote className="size-3.5" aria-hidden /> {evidence.label} · {evidence.kind.replace("_", " ")}
            </figcaption>
            <blockquote className="mt-1 text-sm whitespace-pre-line text-foreground">{evidenceText ?? "Source not available (note not generated yet)."}</blockquote>
            <button
              type="button"
              aria-label="Close evidence"
              onClick={() => setEvidence(null)}
              className="absolute top-2 right-2 rounded-md p-1 text-muted-foreground outline-none hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <X className="size-4" />
            </button>
          </figure>
        )}
        <SuggestionTable
          caseId={caseId}
          suggestions={data.suggestions}
          locked={locked}
          activeEvidence={activeKey}
          onEvidence={(ref) => setEvidence(activeKey === evidenceKey(ref) ? null : ref)}
        />
      </SectionCard>
      <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <AttestCard coding={data} noteStatus={detail.summary.noteStatus} patientName={detail.case.patient.displayName} caseNumber={detail.case.caseNumber} />
        <ChargeExportCard coding={data} />
      </div>
    </div>
  );
}
