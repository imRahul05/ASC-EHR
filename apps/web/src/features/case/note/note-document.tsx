"use client";

import { formatDateTime, signGate } from "@asc/clinical-rules";
import type { CaseDetail, NoteDraft, NoteSection } from "@asc/types";
import { confidenceTone, DraftBanner, SectionCard } from "@asc/ui";
import { ChevronRight, Lock } from "@asc/ui/icons";
import { ExceptionsPanel } from "./exceptions-panel";
import { FindingsTable } from "./findings-table";
import { NoteSectionCard } from "./note-section-card";
import { QualityStrip } from "./quality-strip";
import { RegenerateButton } from "./regenerate-button";
import { SignNoteDialog } from "./sign-note-dialog";

interface NoteDocumentProps {
  readonly detail: CaseDetail;
  readonly note: NoteDraft;
  /** `enriching` = draft shown while critic/coding branches still run (read-only). */
  readonly mode: "review" | "enriching" | "signed";
  readonly onRegenerate: () => void;
}

/**
 * Draft-first review: exceptions first, sections needing attention expanded (open gaps, open critic
 * suggestions, low confidence), the rest collapsed; findings + quality; human sign with confirm.
 * Signed notes render the same content locked, with signature provenance.
 */
export function NoteDocument({ detail, note, mode, onRegenerate }: NoteDocumentProps) {
  const locked = mode !== "review";
  const gate = signGate(note);
  const needsAttention = (section: NoteSection) =>
    note.gapChips.some((chip) => chip.sectionId === section.id && !chip.resolved) ||
    note.criticSuggestions.some((item) => item.sectionId === section.id && item.status === "open") ||
    (section.source === "ai" && confidenceTone(section.confidence) !== "high");
  const attention = mode === "signed" ? [] : note.sections.filter(needsAttention);
  const rest = mode === "signed" ? note.sections : note.sections.filter((section) => !needsAttention(section));
  const editedCount = note.sections.filter((section) => section.source === "edited").length;

  const card = (section: NoteSection) => (
    <NoteSectionCard
      key={section.id}
      caseId={detail.case.id}
      section={section}
      provenance={note.provenance}
      gaps={mode === "signed" ? [] : note.gapChips.filter((chip) => chip.sectionId === section.id)}
      suggestions={mode === "signed" ? [] : note.criticSuggestions.filter((item) => item.sectionId === section.id)}
      locked={locked}
    />
  );

  return (
    <div className="space-y-4" data-testid="note-document" data-mode={mode}>
      {mode === "signed" ? (
        <DraftBanner
          state="signed"
          meta={note.signedAt ? `${note.signedBy?.name ?? ""} · ${formatDateTime(note.signedAt)}` : undefined}
          message="Signed and locked. Changes require an addendum."
        />
      ) : mode === "review" ? (
        <DraftBanner
          state="draft"
          meta={`v${note.version} · ${note.provenance.promptVersion}`}
          message={gate.ok ? "Nothing is final until you sign." : `Signing is blocked: ${gate.reasons.map((reason) => reason.message).join(" ")}`}
          actions={
            <>
              <RegenerateButton version={note.version} editedCount={editedCount} onConfirm={onRegenerate} />
              <SignNoteDialog procedureCase={detail.case} version={note.version} disabled={!gate.ok} />
            </>
          }
        />
      ) : null}

      <QualityStrip detail={detail} />

      {mode !== "signed" && <ExceptionsPanel caseId={detail.case.id} note={note} locked={locked} />}

      {attention.length > 0 && (
        <section aria-labelledby="note-attention-heading" className="space-y-3">
          <h2 id="note-attention-heading" className="text-sm font-semibold text-muted-foreground">
            Review first · {attention.length} section{attention.length === 1 ? "" : "s"}
          </h2>
          {attention.map(card)}
        </section>
      )}

      {mode === "signed" ? (
        <section aria-label="Signed note" className="space-y-3">
          {rest.map(card)}
        </section>
      ) : (
        rest.length > 0 && (
          <details className="group space-y-3" data-testid="note-rest-sections">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-1 py-2 text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40">
              <ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
              {rest.length} section{rest.length === 1 ? "" : "s"} with high confidence and no open issues
            </summary>
            <div className="mt-3 space-y-3">{rest.map(card)}</div>
          </details>
        )
      )}

      <SectionCard title="Findings" description="Structured findings linked to specimen jars" data-testid="note-findings">
        <FindingsTable findings={note.findings} specimens={detail.specimens} gaps={note.gapChips} />
      </SectionCard>

      {mode === "signed" && (
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Lock aria-hidden className="size-4" /> Signature & provenance
            </span>
          }
          data-testid="note-signature"
        >
          <dl className="grid gap-3 text-sm @md:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Electronically signed by</dt>
              <dd className="font-medium">{note.signedBy?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Signed at</dt>
              <dd className="font-medium tabular-nums">{note.signedAt ? formatDateTime(note.signedAt) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">AI draft</dt>
              <dd>
                {note.provenance.agent} · {note.provenance.promptVersion} · generated {formatDateTime(note.provenance.generatedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Clinician edits</dt>
              <dd>
                {editedCount === 0
                  ? "None — AI text signed as drafted"
                  : note.sections
                      .filter((section) => section.source === "edited")
                      .map((section) => `${section.title}${section.editedBy ? ` (${section.editedBy.initials})` : ""}`)
                      .join(", ")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Version</dt>
              <dd className="tabular-nums">v{note.version}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Gaps resolved</dt>
              <dd className="tabular-nums">
                {note.gapChips.filter((chip) => chip.resolved).length}/{note.gapChips.length}
              </dd>
            </div>
          </dl>
        </SectionCard>
      )}
    </div>
  );
}
