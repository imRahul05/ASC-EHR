"use client";

import { useState } from "react";
import { useRecordBbps } from "@asc/api-client/react";
import { bbpsAdequate, bbpsTotal } from "@asc/clinical-rules";
import type { BbpsScore, CaseDetail } from "@asc/types";
import { Button, cn, SectionCard, SegmentedControl, toast } from "@asc/ui";
import { CircleCheck, LoaderCircle, TriangleAlert } from "@asc/ui/icons";
import { notifyError } from "../notify-error";

interface BbpsEntryProps {
  readonly detail: CaseDetail;
  readonly editable: boolean;
}

type Segment = keyof BbpsScore;
type SegmentScore = BbpsScore[Segment];
type Draft = Readonly<Record<Segment, SegmentScore | null>>;

const SEGMENTS: readonly { readonly id: Segment; readonly label: string }[] = [
  { id: "right", label: "Right colon" },
  { id: "transverse", label: "Transverse colon" },
  { id: "left", label: "Left colon" },
];

const SCORE_OPTIONS: readonly { readonly value: SegmentScore; readonly label: string; readonly hint: string }[] = [
  { value: 0, label: "0", hint: "Unprepared" },
  { value: 1, label: "1", hint: "Partly seen" },
  { value: 2, label: "2", hint: "Minor residue" },
  { value: 3, label: "3", hint: "Entirely clean" },
];

const EMPTY: Draft = { right: null, transverse: null, left: null };

function complete(draft: Draft): BbpsScore | null {
  const { right, transverse, left } = draft;
  return right === null || transverse === null || left === null ? null : { right, transverse, left };
}

/** Boston Bowel Preparation Scale (0–3 per segment); adequate = total ≥ 6 and every segment ≥ 2. */
export function BbpsEntry({ detail, editable }: BbpsEntryProps) {
  const [draft, setDraft] = useState<Draft>(detail.case.bbps ?? EMPTY);
  const record = useRecordBbps(detail.case.id);
  const score = complete(draft);
  const adequate = score ? bbpsAdequate(score) : false;
  const saved = detail.case.bbps;
  const dirty = !saved || SEGMENTS.some(({ id }) => saved[id] !== draft[id]);

  const save = () => {
    if (!score) return;
    record.mutate(score, { onSuccess: () => toast.success(`BBPS ${bbpsTotal(score)}/9 saved`), onError: notifyError("Could not save BBPS") });
  };

  return (
    <SectionCard
      title="Bowel prep (BBPS)"
      description="Score each segment after washing and suctioning."
      data-testid="procedure-bbps"
      footer={
        editable ? (
          <Button size="lg" className="h-12 text-base" disabled={!score || !dirty || record.isPending} onClick={save} data-testid="procedure-bbps-save">
            {record.isPending && <LoaderCircle className="animate-spin" />}
            {saved && !dirty ? "Saved" : "Save BBPS"}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {SEGMENTS.map(({ id, label }) => (
          <div key={id} className="space-y-1.5">
            <p className="text-sm font-medium" id={`bbps-${id}-label`}>
              {label}
            </p>
            <SegmentedControl
              options={SCORE_OPTIONS}
              value={draft[id]}
              onValueChange={(value) => setDraft((current) => ({ ...current, [id]: value }))}
              aria-label={`${label} BBPS score`}
              disabled={!editable}
              className="[&>button]:min-h-14 [&>button]:text-base"
              data-testid={`procedure-bbps-${id}`}
            />
          </div>
        ))}
        <p
          className={cn("flex items-center gap-2 text-base font-semibold tabular-nums", !score ? "text-muted-foreground" : adequate ? "text-success" : "text-warning")}
          data-testid="procedure-bbps-total"
        >
          {score && (adequate ? <CircleCheck aria-hidden className="size-5" /> : <TriangleAlert aria-hidden className="size-5" />)}
          {score ? `Total ${bbpsTotal(score)}/9 · ${adequate ? "adequate" : "inadequate"} prep` : "Score all three segments"}
        </p>
      </div>
    </SectionCard>
  );
}
