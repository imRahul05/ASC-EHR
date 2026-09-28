"use client";

import { ApiError } from "@asc/api-client";
import { useApproveDischargeInstructions, useGenerateDischargeInstructions } from "@asc/api-client/react";
import { formatTime24 } from "@asc/clinical-rules/time";
import type { DischargeInstructions } from "@asc/types";
import { Button, DraftBanner, EmptyState, ProvenanceChip, SectionCard, toast } from "@asc/ui";
import { CircleCheck, FileText, LoaderCircle, RotateCw, Sparkles } from "@asc/ui/icons";

interface DischargeInstructionsCardProps {
  readonly caseId: string;
  readonly instructions: DischargeInstructions | null;
  readonly editable: boolean;
}

const failed = (fallback: string) => (error: Error) => toast.error(error instanceof ApiError ? error.message : fallback);

/** AI discharge instructions: generate → draft (visible, with provenance) → nurse approves. Never auto-approved. */
export function DischargeInstructionsCard({ caseId, instructions, editable }: DischargeInstructionsCardProps) {
  const generate = useGenerateDischargeInstructions(caseId);
  const approve = useApproveDischargeInstructions(caseId);
  const busy = generate.isPending || approve.isPending;

  const onGenerate = () =>
    generate.mutate(undefined, { onSuccess: () => toast.success("Draft instructions ready for review"), onError: failed("Could not generate instructions") });
  const onApprove = () =>
    approve.mutate(undefined, { onSuccess: () => toast.success("Discharge instructions approved"), onError: failed("Could not approve instructions") });

  return (
    <SectionCard
      title="Discharge instructions"
      description={instructions ? `${instructions.language} · ${instructions.readingLevel}` : "Plain-language, patient-specific instructions drafted by AI."}
      actions={instructions ? <ProvenanceChip provenance={instructions.provenance} /> : undefined}
      data-testid="recovery-instructions"
    >
      <div className="space-y-4">
        {generate.isPending && <DraftBanner state="streaming" message="Drafting instructions from the procedure, findings and medications…" />}
        {!generate.isPending && instructions === null && (
          <EmptyState
            icon={FileText}
            title="No instructions yet"
            description="Generate a draft, review it, then approve before discharge."
            action={
              editable ? (
                <Button onClick={onGenerate} disabled={busy} data-testid="recovery-instructions-generate">
                  <Sparkles /> Generate with AI
                </Button>
              ) : undefined
            }
            className="py-8"
          />
        )}
        {!generate.isPending && instructions && (
          <>
            <DraftBanner
              state={instructions.status === "approved" ? "signed" : "draft"}
              message={
                instructions.status === "approved"
                  ? `Approved${instructions.approvedBy ? ` by ${instructions.approvedBy.name}` : ""}${instructions.approvedAt ? ` at ${formatTime24(instructions.approvedAt)}` : ""}. Visible to the patient in the portal.`
                  : "Review each section. The patient sees these only after you approve."
              }
              actions={
                editable && instructions.status === "draft" ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={onGenerate} disabled={busy} data-testid="recovery-instructions-regenerate">
                      <RotateCw /> Regenerate
                    </Button>
                    <Button size="sm" onClick={onApprove} disabled={busy} data-testid="recovery-instructions-approve">
                      {approve.isPending ? <LoaderCircle className="animate-spin" /> : <CircleCheck />}
                      Approve
                    </Button>
                  </>
                ) : undefined
              }
            />
            <dl className="space-y-3">
              {instructions.sections.map((section) => (
                <div key={section.title} className="rounded-lg border border-border/70 p-3">
                  <dt className="text-sm font-medium">{section.title}</dt>
                  <dd className="mt-1 text-sm whitespace-pre-line text-muted-foreground">{section.body}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>
    </SectionCard>
  );
}
