"use client";

import { useState } from "react";
import { ApiError } from "@asc/api-client";
import { useUpdateCodingStatus } from "@asc/api-client/react";
import type { CodingStatus, CodingSuggestion, EvidenceRef } from "@asc/types";
import { Badge, Button, ConfidenceBadge, DataTable, toast, type DataTableColumn } from "@asc/ui";
import { Check, Pencil, Undo2, X } from "@asc/ui/icons";
import { EditCodeDialog } from "./edit-code-dialog";
import { evidenceKey } from "./evidence";

const SYSTEM_LABEL: Readonly<Record<CodingSuggestion["system"], string>> = { CPT: "CPT", ICD10: "ICD-10", MOD: "Modifier" };
const STATUS_STYLE: Readonly<Record<CodingStatus, { readonly label: string; readonly className: string }>> = {
  suggested: { label: "To review", className: "border-ai-border bg-ai text-ai-foreground" },
  accepted: { label: "Accepted", className: "border-success/30 text-success" },
  edited: { label: "Edited", className: "border-info/30 text-info" },
  rejected: { label: "Rejected", className: "text-muted-foreground line-through" },
};
/** Exceptions first: unreviewed before reviewed, then lowest confidence first. */
const STATUS_RANK: Readonly<Record<CodingStatus, number>> = { suggested: 0, edited: 1, accepted: 2, rejected: 3 };

interface SuggestionTableProps {
  readonly caseId: string;
  readonly suggestions: readonly CodingSuggestion[];
  readonly locked: boolean;
  readonly activeEvidence: string | null;
  readonly onEvidence: (ref: EvidenceRef) => void;
}

/** CPT / ICD-10 / modifier suggestions with confidence, evidence links and accept / reject / edit. */
export function SuggestionTable({ caseId, suggestions, locked, activeEvidence, onEvidence }: SuggestionTableProps) {
  const [editing, setEditing] = useState<CodingSuggestion | null>(null);
  const update = useUpdateCodingStatus(caseId);
  const rows = [...suggestions].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.confidence - b.confidence);

  const setStatus = (suggestion: CodingSuggestion, status: CodingStatus, edit?: { code: string; description: string }) =>
    update.mutate(
      { suggestionId: suggestion.id, status, ...edit },
      {
        onSuccess: () => setEditing(null),
        onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not update the code"),
      },
    );

  const columns: readonly DataTableColumn<CodingSuggestion>[] = [
    {
      id: "code",
      header: "Code",
      cell: (row) => (
        <div className="space-y-1">
          <p className={row.status === "rejected" ? "font-mono text-muted-foreground line-through" : "font-mono font-medium"}>{row.code}</p>
          <p className="text-[11px] text-muted-foreground">
            {SYSTEM_LABEL[row.system]} · {row.line}
          </p>
        </div>
      ),
    },
    {
      id: "description",
      header: "Description & rationale",
      className: "min-w-56 whitespace-normal",
      cell: (row) => (
        <div className="space-y-0.5">
          <p className="text-sm">{row.description}</p>
          <p className="text-xs text-muted-foreground">{row.rationale}</p>
        </div>
      ),
    },
    { id: "confidence", header: "Confidence", cell: (row) => <ConfidenceBadge value={row.confidence} /> },
    {
      id: "evidence",
      header: "Evidence",
      className: "whitespace-normal",
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.evidenceRefs.map((ref) => (
            <button
              key={evidenceKey(ref)}
              type="button"
              onClick={() => onEvidence(ref)}
              aria-pressed={activeEvidence === evidenceKey(ref)}
              className="inline-flex h-6 items-center rounded-full border border-border px-2 text-[11px] text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/40 aria-pressed:bg-accent"
              data-testid={`coding-evidence-${row.id}-${ref.id}`}
            >
              {ref.label}
            </button>
          ))}
        </div>
      ),
    },
    {
      id: "status",
      header: "Review",
      align: "right",
      cell: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Badge variant="outline" className={STATUS_STYLE[row.status].className}>
            {STATUS_STYLE[row.status].label}
          </Badge>
          {!locked && row.status === "suggested" && (
            <>
              <Button size="icon-sm" variant="ghost" aria-label={`Accept ${row.code}`} onClick={() => setStatus(row, "accepted")} disabled={update.isPending} data-testid={`coding-accept-${row.id}`}>
                <Check />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Edit ${row.code}`} onClick={() => setEditing(row)} disabled={update.isPending} data-testid={`coding-edit-${row.id}`}>
                <Pencil />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Reject ${row.code}`} onClick={() => setStatus(row, "rejected")} disabled={update.isPending} data-testid={`coding-reject-${row.id}`}>
                <X />
              </Button>
            </>
          )}
          {!locked && row.status !== "suggested" && (
            <Button size="icon-sm" variant="ghost" aria-label={`Undo review of ${row.code}`} onClick={() => setStatus(row, "suggested")} disabled={update.isPending} data-testid={`coding-undo-${row.id}`}>
              <Undo2 />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable columns={columns} rows={rows} getRowId={(row) => row.id} data-testid="coding-suggestions" />
      <EditCodeDialog
        suggestion={editing}
        pending={update.isPending}
        onCancel={() => setEditing(null)}
        onSave={(edit) => editing && setStatus(editing, "edited", edit)}
      />
    </>
  );
}
