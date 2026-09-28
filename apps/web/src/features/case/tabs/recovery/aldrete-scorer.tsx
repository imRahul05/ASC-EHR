"use client";

import { useState } from "react";
import { ApiError } from "@asc/api-client";
import { useSaveAldrete } from "@asc/api-client/react";
import { ALDRETE_COMPONENTS, ALDRETE_DISCHARGE_MIN, aldreteTotal } from "@asc/clinical-rules";
import { formatTime24 } from "@asc/clinical-rules/time";
import type { AldreteComponent, AldreteInput, AldreteScore } from "@asc/types";
import { Badge, Button, SectionCard, SegmentedControl, toast } from "@asc/ui";
import { LoaderCircle, Save } from "@asc/ui/icons";
import { AldreteHistory } from "./aldrete-history";

/** Modified Aldrete criteria: label + what 0 / 1 / 2 mean (shown under each segment). */
const CRITERIA: Readonly<Record<keyof AldreteInput, { readonly label: string; readonly levels: readonly [string, string, string] }>> = {
  activity: { label: "Activity", levels: ["No movement", "Moves 2 limbs", "Moves 4 limbs"] },
  respiration: { label: "Respiration", levels: ["Apneic", "Dyspnea / shallow", "Deep breath, cough"] },
  circulation: { label: "Circulation (BP vs pre-op)", levels: ["> ±50 mmHg", "±20–50 mmHg", "Within ±20 mmHg"] },
  consciousness: { label: "Consciousness", levels: ["Not responding", "Arousable", "Fully awake"] },
  oxygenSaturation: { label: "O₂ saturation", levels: ["< 90 % with O₂", "> 90 % with O₂", "> 92 % on room air"] },
};

const LEVELS: readonly AldreteComponent[] = [0, 1, 2];

type Draft = Partial<Record<keyof AldreteInput, AldreteComponent>>;

interface AldreteScorerProps {
  readonly caseId: string;
  readonly current: AldreteScore | null;
  readonly editable: boolean;
}

function isComplete(draft: Draft): draft is AldreteInput {
  return ALDRETE_COMPONENTS.every((key) => draft[key] !== undefined);
}

/** Modified Aldrete: 5 criteria scored 0–2 with segmented buttons, running total, save → time series. */
export function AldreteScorer({ caseId, current, editable }: AldreteScorerProps) {
  const [draft, setDraft] = useState<Draft>(() => (current ? pickInput(current) : {}));
  const save = useSaveAldrete(caseId);
  const complete = isComplete(draft);
  const total = complete ? aldreteTotal(draft) : ALDRETE_COMPONENTS.reduce((sum, key) => sum + (draft[key] ?? 0), 0);
  const hasZero = ALDRETE_COMPONENTS.some((key) => draft[key] === 0);
  const meets = complete && total >= ALDRETE_DISCHARGE_MIN && !hasZero;

  const onSave = () => {
    if (!isComplete(draft)) return;
    save.mutate(draft, {
      onSuccess: () => toast.success(`Aldrete ${aldreteTotal(draft)}/10 recorded`),
      onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not save the Aldrete score"),
    });
  };

  return (
    <SectionCard
      title="Modified Aldrete"
      description={current ? `Last scored ${formatTime24(current.recordedAt)} by ${current.recordedBy.name}` : "Score each criterion 0–2. Discharge needs ≥ 9 with no zero."}
      actions={
        <Badge variant={meets ? "outline" : "secondary"} className={meets ? "border-success/40 text-success" : undefined} data-testid="recovery-aldrete-total">
          <span className="tabular-nums">{`${complete ? total : "–"}/10${meets ? " · meets" : ""}`}</span>
        </Badge>
      }
      footer={
        editable ? (
          <Button onClick={onSave} disabled={!complete || save.isPending} data-testid="recovery-aldrete-save">
            {save.isPending ? <LoaderCircle className="animate-spin" /> : <Save />}
            Record score
          </Button>
        ) : undefined
      }
      data-testid="recovery-aldrete"
    >
      <div className="space-y-4">
        {ALDRETE_COMPONENTS.map((key) => (
          <div key={key} className="space-y-1.5">
            <p className="text-sm font-medium" id={`aldrete-${key}`}>
              {CRITERIA[key].label}
            </p>
            <SegmentedControl
              aria-label={CRITERIA[key].label}
              options={LEVELS.map((level) => ({ value: level, label: level, hint: CRITERIA[key].levels[level] }))}
              value={draft[key] ?? null}
              onValueChange={(value) => setDraft((prev) => ({ ...prev, [key]: value }))}
              disabled={!editable}
              data-testid={`recovery-aldrete-${key}`}
            />
          </div>
        ))}
        <AldreteHistory caseId={caseId} />
      </div>
    </SectionCard>
  );
}

function pickInput(score: AldreteScore): Draft {
  return Object.fromEntries(ALDRETE_COMPONENTS.map((key) => [key, score[key]]));
}
