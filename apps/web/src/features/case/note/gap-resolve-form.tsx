"use client";

import { useState, type FormEvent } from "react";
import { useResolveGapChip } from "@asc/api-client/react";
import type { GapChip, NoteSection } from "@asc/types";
import { Button, FormField, Input, Textarea, toast } from "@asc/ui";
import { Check, LoaderCircle } from "@asc/ui/icons";
import { notifyError } from "../notify-error";

interface GapResolveFormProps {
  readonly caseId: string;
  readonly chip: GapChip;
  readonly section: NoteSection | undefined;
  readonly onDone: () => void;
}

interface Draft {
  readonly resolution: string;
  readonly content: string;
}

/** Resolve a gap: say what was documented and (optionally) fix the section text in the same step. */
export function GapResolveForm({ caseId, chip, section, onDone }: GapResolveFormProps) {
  const [draft, setDraft] = useState<Draft>({ resolution: "", content: section?.content ?? "" });
  const resolve = useResolveGapChip(caseId);
  const contentChanged = section !== undefined && draft.content.trim() !== section.content.trim();
  const valid = draft.resolution.trim().length > 0;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid) return;
    resolve.mutate(
      { chipId: chip.id, resolution: draft.resolution.trim(), ...(contentChanged ? { sectionContent: draft.content.trim() } : {}) },
      {
        onSuccess: () => {
          toast.success(chip.blocking ? "Blocking gap resolved" : "Gap resolved");
          onDone();
        },
        onError: notifyError("Could not resolve the gap"),
      },
    );
  };

  return (
    <form onSubmit={submit} className="mt-2 space-y-3 rounded-lg border border-border bg-background p-3" data-testid="note-gap-form" aria-label="Resolve gap">
      <FormField id={`gap-${chip.id}-resolution`} label="What did you document?">
        <Input
          id={`gap-${chip.id}-resolution`}
          value={draft.resolution}
          onChange={(event) => setDraft((current) => ({ ...current, resolution: event.target.value }))}
          placeholder="e.g. Polyp measured 4 mm against open snare"
          autoFocus
          data-testid="note-gap-resolution"
        />
      </FormField>
      {section && (
        <FormField id={`gap-${chip.id}-content`} label={`${section.title} text (edit to add the missing detail)`}>
          <Textarea
            id={`gap-${chip.id}-content`}
            value={draft.content}
            onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
            className="min-h-28 text-sm leading-relaxed"
            data-testid="note-gap-content"
          />
        </FormField>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{contentChanged ? "Section text will be marked as edited by you." : "Section text unchanged."}</p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!valid || resolve.isPending} data-testid="note-gap-submit">
            {resolve.isPending ? <LoaderCircle className="animate-spin" /> : <Check />}
            Resolve
          </Button>
        </div>
      </div>
    </form>
  );
}
