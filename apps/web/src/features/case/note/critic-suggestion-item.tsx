"use client";

import { useUpdateCriticSuggestion } from "@asc/api-client/react";
import type { CriticSuggestion } from "@asc/types";
import { AiBadge, Badge, Button, toast } from "@asc/ui";
import { Check, PencilLine, X } from "@asc/ui/icons";
import { notifyError } from "../notify-error";

interface CriticSuggestionItemProps {
  readonly caseId: string;
  readonly suggestion: CriticSuggestion;
  /** The clinician edited this section: the suggestion must never overwrite it. */
  readonly sectionEdited: boolean;
  readonly locked: boolean;
  /** Put the suggested text in the section editor so the clinician merges it by hand. */
  readonly onOpenInEditor: (text: string) => void;
}

const STATUS_LABEL = { accepted: "Accepted", dismissed: "Dismissed" } as const;

/**
 * Critic branch output as a suggestion (MindScript: critic never overwrites physician edits).
 * Accept replaces an untouched AI section; on an edited section the only options are "open in editor" or dismiss.
 */
export function CriticSuggestionItem({ caseId, suggestion, sectionEdited, locked, onOpenInEditor }: CriticSuggestionItemProps) {
  const update = useUpdateCriticSuggestion(caseId);
  const decide = (status: "accepted" | "dismissed") =>
    update.mutate(
      { suggestionId: suggestion.id, status },
      { onSuccess: () => toast.success(status === "accepted" ? "Suggestion applied" : "Suggestion dismissed"), onError: notifyError("Could not update the suggestion") },
    );

  return (
    <div className="space-y-2 rounded-lg border border-ai-border bg-ai/60 p-3" data-testid="note-critic-suggestion" data-status={suggestion.status}>
      <div className="flex flex-wrap items-center gap-2">
        <AiBadge label="Critic suggestion" />
        {suggestion.status !== "open" && <Badge variant="outline">{STATUS_LABEL[suggestion.status]}</Badge>}
      </div>
      <p className="text-sm">{suggestion.message}</p>
      {suggestion.suggestedText && suggestion.status === "open" && (
        <blockquote className="border-l-2 border-ai-foreground/40 pl-3 text-sm text-muted-foreground italic">{suggestion.suggestedText}</blockquote>
      )}
      {suggestion.status === "open" && !locked && (
        <div className="flex flex-wrap items-center gap-2">
          {sectionEdited ? (
            <>
              <p className="w-full text-xs text-muted-foreground">You edited this section, so the suggestion will not overwrite it.</p>
              {suggestion.suggestedText && (
                <Button size="sm" variant="outline" onClick={() => onOpenInEditor(suggestion.suggestedText ?? "")} data-testid="note-critic-open-editor">
                  <PencilLine /> Open in editor
                </Button>
              )}
            </>
          ) : (
            <Button size="sm" disabled={update.isPending} onClick={() => decide("accepted")} data-testid="note-critic-accept">
              <Check /> Accept
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => decide("dismissed")} data-testid="note-critic-dismiss">
            <X /> Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}
