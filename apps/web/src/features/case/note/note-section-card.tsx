"use client";

import { useState } from "react";
import { useUpdateNoteSection } from "@asc/api-client/react";
import type { AiProvenance, CriticSuggestion, GapChip, NoteSection } from "@asc/types";
import { AiBadge, Badge, Button, ConfidenceBadge, ProvenanceChip, Textarea, toast } from "@asc/ui";
import { FileSearch, LoaderCircle, OctagonAlert, Pencil, UserPen } from "@asc/ui/icons";
import { notifyError } from "../notify-error";
import { CriticSuggestionItem } from "./critic-suggestion-item";

interface NoteSectionCardProps {
  readonly caseId: string;
  readonly section: NoteSection;
  readonly provenance: AiProvenance;
  readonly gaps: readonly GapChip[];
  readonly suggestions: readonly CriticSuggestion[];
  /** No editing (checks still running, or signed). */
  readonly locked: boolean;
}

/** One note section: AI/edited marker, confidence, provenance, inline edit, and its critic suggestions. */
export function NoteSectionCard({ caseId, section, provenance, gaps, suggestions, locked }: NoteSectionCardProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const save = useUpdateNoteSection(caseId);
  const edited = section.source === "edited";
  const openGaps = gaps.filter((chip) => !chip.resolved);

  const submit = () => {
    if (editing === null) return;
    const content = editing.trim();
    if (content === section.content.trim()) {
      setEditing(null);
      return;
    }
    save.mutate(
      { sectionId: section.id, content },
      {
        onSuccess: () => {
          toast.success(`${section.title} saved`);
          setEditing(null);
        },
        onError: notifyError("Could not save the section"),
      },
    );
  };

  return (
    <article
      id={`note-section-${section.id}`}
      className="scroll-mt-20 space-y-3 rounded-xl border border-border bg-card p-4 shadow-xs"
      data-testid={`note-section-${section.id}`}
      data-source={section.source}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold tracking-tight">{section.title}</h3>
        {openGaps.length > 0 && (
          <Badge variant="outline" className="border-destructive/30 text-destructive">
            <OctagonAlert aria-hidden /> {openGaps.length} gap{openGaps.length === 1 ? "" : "s"}
          </Badge>
        )}
        {edited ? (
          <Badge variant="outline" data-testid="note-section-edited">
            <UserPen aria-hidden /> Edited
          </Badge>
        ) : (
          <AiBadge label={locked ? "AI-drafted" : undefined} />
        )}
        {!edited && <ConfidenceBadge value={section.confidence} />}
        <ProvenanceChip provenance={provenance} editedBy={section.editedBy?.name} />
        {section.evidenceRefs.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title="Room events, specimens and doses this text is grounded on">
            <FileSearch aria-hidden className="size-3" /> {section.evidenceRefs.length} sources
          </span>
        )}
        {!locked && editing === null && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(section.content)} aria-label={`Edit ${section.title}`} data-testid={`note-section-edit-${section.id}`}>
            <Pencil /> Edit
          </Button>
        )}
      </header>

      {editing === null ? (
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{section.content}</p>
      ) : (
        <div className="space-y-2">
          <label htmlFor={`note-edit-${section.id}`} className="sr-only">
            {section.title}
          </label>
          <Textarea
            id={`note-edit-${section.id}`}
            value={editing}
            onChange={(event) => setEditing(event.target.value)}
            className="min-h-32 text-sm leading-relaxed"
            data-testid={`note-section-textarea-${section.id}`}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button size="sm" disabled={save.isPending || editing.trim().length === 0} onClick={submit} data-testid={`note-section-save-${section.id}`}>
              {save.isPending && <LoaderCircle className="animate-spin" />}
              Save section
            </Button>
          </div>
        </div>
      )}

      {suggestions.map((suggestion) => (
        <CriticSuggestionItem
          key={suggestion.id}
          caseId={caseId}
          suggestion={suggestion}
          sectionEdited={edited}
          locked={locked}
          onOpenInEditor={(text) => setEditing(text)}
        />
      ))}
    </article>
  );
}
