"use client";

import { useCase, useNote, useNoteGeneration } from "@asc/api-client/react";
import { isPhaseAtLeast, PHASE_LABEL, STOPPED_PHASES } from "@asc/clinical-rules";
import { Button, EmptyState, ErrorState, LoadingSkeleton } from "@asc/ui";
import { FileText, RotateCcw, TriangleAlert } from "@asc/ui/icons";
import { NoteDocument } from "../note/note-document";
import { NoteGeneratePanel } from "../note/note-generate-panel";
import { NoteGenerationStatus } from "../note/note-generation-status";
import { notePipelineSteps } from "../note/note-pipeline";
import { StreamingSections } from "../note/streaming-sections";

interface NoteTabProps {
  readonly caseId: string;
}

/**
 * AI procedure note (the wedge): Generate (from RECOVERY) → streamed sections + draft-first pipeline →
 * review (exceptions first, provenance, gap-chips, critic suggestions) → human sign with confirm → locked.
 */
export function NoteTab({ caseId }: NoteTabProps) {
  const caseQuery = useCase(caseId);
  const noteQuery = useNote(caseId);
  const gen = useNoteGeneration(caseId);

  if (caseQuery.isPending || noteQuery.isPending) return <LoadingSkeleton variant="detail" />;
  if (caseQuery.isError || noteQuery.isError) {
    return (
      <ErrorState
        title="Could not load the note"
        message="Check your connection and try again."
        onRetry={() => void Promise.all([caseQuery.refetch(), noteQuery.refetch()])}
      />
    );
  }

  const detail = caseQuery.data;
  const { phase } = detail.case;
  const steps = notePipelineSteps({
    status: gen.status,
    sectionsDone: gen.sections.filter((section) => section.complete).length,
    note: gen.note,
    codingSuggestionCount: gen.codingSuggestionCount,
  });
  const start = () => void gen.start();
  const blockedReason = STOPPED_PHASES.includes(phase)
    ? `The case is ${PHASE_LABEL[phase].toLowerCase()}.`
    : isPhaseAtLeast(phase, "RECOVERY")
      ? null
      : "Available once the procedure has ended (Recovery).";

  if (gen.status === "streaming") {
    return (
      <div className="@container space-y-4" data-testid="case-tab-note">
        <NoteGenerationStatus phase="streaming" startedAt={gen.startedAt} steps={steps} onCancel={gen.cancel} onRetry={start} />
        <StreamingSections sections={gen.sections} />
      </div>
    );
  }

  const enriching = gen.status === "draft_ready" && gen.note !== null;
  const note = enriching ? gen.note : noteQuery.data;
  const interrupted = gen.status === "failed" || gen.status === "cancelled";

  return (
    <div className="@container space-y-4" data-testid="case-tab-note">
      {enriching && <NoteGenerationStatus phase="draft_ready" startedAt={gen.startedAt} steps={steps} onCancel={gen.cancel} onRetry={start} />}
      {interrupted && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 @md:flex-row @md:items-center @md:justify-between"
          data-testid="note-generation-interrupted"
        >
          <p className="flex items-start gap-2 text-sm">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>
              <span className="font-medium">{gen.status === "cancelled" ? "Generation cancelled." : "Generation failed."}</span>{" "}
              <span className="text-muted-foreground">{gen.error ?? (note ? "The previous draft is unchanged." : "No draft was saved.")}</span>
            </span>
          </p>
          <Button size="sm" variant="outline" onClick={start} data-testid="note-retry">
            <RotateCcw /> Retry
          </Button>
        </div>
      )}
      {gen.status === "completed" && gen.codingSuggestionCount !== null && (
        <p className="text-xs text-muted-foreground" role="status" data-testid="note-pipeline-summary">
          AI pipeline completed · {gen.codingSuggestionCount} coding suggestions ready for the coder after you sign.
        </p>
      )}

      {note === null || note === undefined ? (
        <NoteGeneratePanel detail={detail} blockedReason={blockedReason} onGenerate={start} />
      ) : note.status === "streaming" ? (
        <EmptyState icon={FileText} title="A draft is being generated" description="Another session started generation. Refresh in a few seconds." />
      ) : (
        <NoteDocument
          detail={detail}
          note={note}
          mode={note.status === "signed" ? "signed" : enriching ? "enriching" : "review"}
          onRegenerate={start}
        />
      )}
    </div>
  );
}
