"use client";

import type { PipelineStep } from "@asc/ui";
import { Button, DraftBanner, ElapsedTime, PipelineSteps, SectionCard } from "@asc/ui";
import { RotateCcw, X } from "@asc/ui/icons";

interface NoteGenerationStatusProps {
  readonly phase: "streaming" | "draft_ready";
  readonly startedAt: number | null;
  readonly steps: readonly PipelineStep[];
  readonly onCancel: () => void;
  readonly onRetry: () => void;
}

/** Streaming banner (elapsed time, Cancel + Retry always visible) and the draft-first pipeline progress. */
export function NoteGenerationStatus({ phase, startedAt, steps, onCancel, onRetry }: NoteGenerationStatusProps) {
  return (
    <div className="space-y-3" data-testid="note-generation-status">
      <DraftBanner
        state="streaming"
        message={
          phase === "streaming"
            ? "AI is writing the note from room events, specimens and the anesthesia record. You can cancel at any time."
            : "Draft is ready — critic, coding and guideline checks are still running. Editing unlocks when they finish."
        }
        meta={startedAt ? <ElapsedTime since={startedAt} label="Elapsed" data-testid="note-elapsed" /> : undefined}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={onCancel} data-testid="note-cancel">
              <X /> Cancel
            </Button>
            <Button variant="ghost" size="sm" onClick={onRetry} data-testid="note-retry">
              <RotateCcw /> Retry
            </Button>
          </>
        }
      />
      <SectionCard title="AI pipeline" description="Draft-first: you can read the note while background checks finish." data-testid="note-pipeline">
        <PipelineSteps steps={steps} aria-label="Note generation progress" />
      </SectionCard>
    </div>
  );
}
