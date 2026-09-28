import type { CaseDetail } from "@asc/types";
import { Button, SectionCard } from "@asc/ui";
import { CircleCheck, CircleMinus, Sparkles } from "@asc/ui/icons";

interface NoteGeneratePanelProps {
  readonly detail: CaseDetail;
  /** Why generation is not available yet (phase < RECOVERY); null = ready. */
  readonly blockedReason: string | null;
  readonly onGenerate: () => void;
}

/** Empty state of the note: what the AI will read, and the Generate action (enabled from RECOVERY). */
export function NoteGeneratePanel({ detail, blockedReason, onGenerate }: NoteGeneratePanelProps) {
  const sources: readonly { readonly label: string; readonly ok: boolean }[] = [
    { label: `${detail.events.length} room events`, ok: detail.events.some((event) => event.type === "SCOPE_OUT") },
    { label: `${detail.specimens.length} specimen jar${detail.specimens.length === 1 ? "" : "s"}`, ok: true },
    { label: `${detail.anesthesia.doses.length} anesthesia doses`, ok: detail.anesthesia.doses.length > 0 },
    { label: detail.case.bbps ? "BBPS recorded" : "BBPS not recorded (will raise a gap)", ok: detail.case.bbps !== undefined },
    { label: `${detail.narration.length} narration lines`, ok: detail.narration.length > 0 },
  ];
  return (
    <SectionCard
      title="Procedure note"
      description="The AI drafts the note from the room record; you review exceptions and sign."
      data-testid="note-generate-panel"
    >
      <div className="flex flex-col gap-6 @xl:flex-row @xl:items-center @xl:justify-between">
        <ul className="space-y-1.5 text-sm" aria-label="Inputs the AI will use">
          {sources.map((source) => (
            <li key={source.label} className="flex items-center gap-2">
              {source.ok ? (
                <CircleCheck aria-label="Available" className="size-4 text-success" />
              ) : (
                <CircleMinus aria-label="Missing" className="size-4 text-muted-foreground" />
              )}
              {source.label}
            </li>
          ))}
        </ul>
        <div className="space-y-2 @xl:max-w-xs @xl:text-right">
          <Button size="lg" disabled={blockedReason !== null} onClick={onGenerate} data-testid="note-generate-button">
            <Sparkles /> Generate AI draft
          </Button>
          <p className="text-xs text-muted-foreground">{blockedReason ?? "Takes about 6 s. Nothing is saved as final until you sign."}</p>
        </div>
      </div>
    </SectionCard>
  );
}
