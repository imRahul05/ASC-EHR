"use client";

import { useState } from "react";
import { PADSS_CRITERIA, PADSS_DISCHARGE_MIN, type PadssCriterion } from "@asc/clinical-rules";
import { Badge, Button, SectionCard, SegmentedControl } from "@asc/ui";
import { ChevronDown, ChevronUp } from "@asc/ui/icons";

type Level = 0 | 1 | 2;
type Draft = Partial<Record<PadssCriterion, Level>>;

const LEVELS: readonly Level[] = [0, 1, 2];

/** Optional PADSS home-readiness check (reference only — not saved; Aldrete drives the gate). */
export function PadssScorer() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const scored = PADSS_CRITERIA.filter(({ key }) => draft[key] !== undefined).length;
  const total = PADSS_CRITERIA.reduce((sum, { key }) => sum + (draft[key] ?? 0), 0);
  const complete = scored === PADSS_CRITERIA.length;

  return (
    <SectionCard
      title="PADSS (optional)"
      description="Post-anesthesia discharge scoring — a second look before sending home. Not saved to the chart."
      actions={
        <>
          {complete && (
            <Badge variant="outline" className={total >= PADSS_DISCHARGE_MIN ? "border-success/40 text-success" : "border-warning/40 text-warning"}>
              <span className="tabular-nums">{total}</span>/10 {total >= PADSS_DISCHARGE_MIN ? "· fit for home" : "· not yet"}
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={() => setOpen((value) => !value)} aria-expanded={open} data-testid="recovery-padss-toggle">
            {open ? <ChevronUp /> : <ChevronDown />}
            {open ? "Hide" : "Score"}
          </Button>
        </>
      }
      contentClassName={open ? "p-4" : "hidden"}
      data-testid="recovery-padss"
    >
      <div className="space-y-4">
        {PADSS_CRITERIA.map(({ key, label, levels }) => (
          <div key={key} className="space-y-1.5">
            <p className="text-sm font-medium">{label}</p>
            <SegmentedControl
              aria-label={`PADSS ${label}`}
              size="sm"
              options={LEVELS.map((level) => ({ value: level, label: level, hint: levels[level] }))}
              value={draft[key] ?? null}
              onValueChange={(value) => setDraft((prev) => ({ ...prev, [key]: value }))}
              data-testid={`recovery-padss-${key}`}
            />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
