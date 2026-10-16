"use client";

/**
 * Pre-Anesthesia Medical Evaluation Card.
 *
 * Regulations & Clinical Standards:
 * - CMS 42 CFR § 416.42(a) Condition for Coverage: Surgical and Anesthesia Services:
 *   Mandatory pre-anesthesia evaluation conducted immediately prior to surgery by a qualified practitioner.
 * - ASA Physical Status Classification System (ASA I–V)
 * - Mallampati Airway Classification (Class I–IV)
 * - ASA Practice Guidelines for Preoperative Fasting (NPO compliance)
 */

import { useReducer } from "react";
import { usePreAnesthesiaAssessment } from "@asc/api-client/react";
import type { AnesthesiaRecord } from "@asc/types";
import {
  Badge,
  Button,
  Checkbox,
  Input,
  OptionSelect,
  SectionCard,
  Textarea,
  toast,
} from "@asc/ui";
import { CheckCircle2, ClipboardCheck, Edit3 } from "@asc/ui/icons";
import { notifyError } from "../notify-error";

interface PreAnesthesiaCardProps {
  readonly caseId: string;
  readonly record: AnesthesiaRecord;
  readonly editable: boolean;
}

interface FormState {
  readonly asaClass: 1 | 2 | 3 | 4 | 5;
  readonly mallampati: 1 | 2 | 3 | 4;
  readonly airwayNotes: string;
  readonly lastOralIntakeIso: string;
  readonly npoStatusSatisfied: boolean;
  readonly isEditing: boolean;
}

type FormAction =
  | { readonly type: "SET_ASA"; readonly value: 1 | 2 | 3 | 4 | 5 }
  | { readonly type: "SET_MALLAMPATI"; readonly value: 1 | 2 | 3 | 4 }
  | { readonly type: "SET_AIRWAY_NOTES"; readonly value: string }
  | { readonly type: "SET_LAST_ORAL_INTAKE"; readonly value: string }
  | { readonly type: "SET_NPO"; readonly value: boolean }
  | { readonly type: "SET_EDITING"; readonly value: boolean };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "SET_ASA":
      return { ...state, asaClass: action.value };
    case "SET_MALLAMPATI":
      return { ...state, mallampati: action.value };
    case "SET_AIRWAY_NOTES":
      return { ...state, airwayNotes: action.value };
    case "SET_LAST_ORAL_INTAKE":
      return { ...state, lastOralIntakeIso: action.value };
    case "SET_NPO":
      return { ...state, npoStatusSatisfied: action.value };
    case "SET_EDITING":
      return { ...state, isEditing: action.value };
  }
}

const ASA_OPTIONS = [
  { value: "1", label: "ASA I - Normal Healthy Patient" },
  { value: "2", label: "ASA II - Mild Systemic Disease" },
  { value: "3", label: "ASA III - Severe Systemic Disease" },
  { value: "4", label: "ASA IV - Severe Disease with Constant Threat to Life" },
  { value: "5", label: "ASA V - Moribund Patient" },
];

const MALLAMPATI_OPTIONS = [
  { value: "1", label: "Class I - Soft palate, fauces, uvula, pillars visible" },
  { value: "2", label: "Class II - Soft palate, fauces, uvula visible" },
  { value: "3", label: "Class III - Soft palate, base of uvula visible" },
  { value: "4", label: "Class IV - Hard palate only visible" },
];

function defaultIntakeTime(): string {
  const d = new Date();
  d.setHours(d.getHours() - 8);
  return d.toISOString().slice(0, 16);
}

export function PreAnesthesiaCard({ caseId, record, editable }: PreAnesthesiaCardProps) {
  const assessment = record.preAssessment;
  const assessmentMutation = usePreAnesthesiaAssessment(caseId);

  const [state, dispatch] = useReducer(formReducer, {
    asaClass: assessment?.asaClass ?? 2,
    mallampati: assessment?.mallampati ?? 2,
    airwayNotes: assessment?.airwayNotes ?? "",
    lastOralIntakeIso: assessment?.lastOralIntakeIso
      ? assessment.lastOralIntakeIso.slice(0, 16)
      : defaultIntakeTime(),
    npoStatusSatisfied: assessment?.npoStatusSatisfied ?? true,
    isEditing: !assessment,
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const isoIntake = new Date(state.lastOralIntakeIso).toISOString();

    assessmentMutation.mutate(
      {
        asaClass: state.asaClass,
        mallampati: state.mallampati,
        airwayNotes: state.airwayNotes.trim() || undefined,
        lastOralIntakeIso: isoIntake,
        npoStatusSatisfied: state.npoStatusSatisfied,
      },
      {
        onSuccess: () => {
          toast.success("Pre-anesthesia evaluation recorded (CMS 42 CFR § 416.42(a))");
          dispatch({ type: "SET_EDITING", value: false });
        },
        onError: notifyError("Could not record pre-anesthesia evaluation"),
      },
    );
  };

  // Verified display state
  if (assessment && !state.isEditing) {
    return (
      <SectionCard
        title="Pre-Anesthesia Medical Evaluation"
        description="Mandatory evaluation completed immediately prior to surgery (CMS 42 CFR § 416.42(a))."
        data-testid="pre-anesthesia-verified-card"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-success/30 bg-success/10 p-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <span className="font-semibold text-success-foreground text-sm">
                Evaluation Verified & Cleared for Sedation
              </span>
            </div>
            {editable && !record.sedationStart && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dispatch({ type: "SET_EDITING", value: true })}
                data-testid="edit-pre-anesthesia-button"
              >
                <Edit3 className="mr-1 h-3.5 w-3.5" /> Edit
              </Button>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">ASA Physical Status</dt>
              <dd className="font-semibold" data-testid="verified-asa">
                <Badge variant="outline">ASA {assessment.asaClass}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Mallampati Airway</dt>
              <dd className="font-semibold" data-testid="verified-mallampati">
                <Badge variant="outline">Class {assessment.mallampati}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">NPO Status</dt>
              <dd className="font-semibold" data-testid="verified-npo">
                {assessment.npoStatusSatisfied ? (
                  <span className="text-success font-medium">Satisfied (≥8h)</span>
                ) : (
                  <span className="text-destructive font-medium">Unsatisfied</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Assessed By</dt>
              <dd className="font-medium text-xs text-muted-foreground">
                {assessment.assessedBy.name} ({assessment.assessedBy.initials})
              </dd>
            </div>
          </dl>

          {assessment.airwayNotes && (
            <div className="rounded-md border border-border p-2.5 text-xs">
              <span className="font-semibold">Airway notes: </span>
              <span>{assessment.airwayNotes}</span>
            </div>
          )}
        </div>
      </SectionCard>
    );
  }

  // Input form state
  return (
    <SectionCard
      title="Pre-Anesthesia Medical Evaluation"
      description="Mandatory prior to sedation start under CMS 42 CFR § 416.42(a) and ASA Standards."
      data-testid="pre-anesthesia-form-card"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="asa-class-select" className="text-xs font-medium">
              ASA Physical Status *
            </label>
            <OptionSelect
              id="asa-class-select"
              options={ASA_OPTIONS}
              value={String(state.asaClass)}
              onValueChange={(val) =>
                dispatch({ type: "SET_ASA", value: Number(val) as 1 | 2 | 3 | 4 | 5 })
              }
              disabled={!editable || assessmentMutation.isPending}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="mallampati-select" className="text-xs font-medium">
              Mallampati Classification *
            </label>
            <OptionSelect
              id="mallampati-select"
              options={MALLAMPATI_OPTIONS}
              value={String(state.mallampati)}
              onValueChange={(val) =>
                dispatch({ type: "SET_MALLAMPATI", value: Number(val) as 1 | 2 | 3 | 4 })
              }
              disabled={!editable || assessmentMutation.isPending}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="last-intake-input" className="text-xs font-medium">
              Last Oral Intake Date/Time *
            </label>
            <Input
              id="last-intake-input"
              type="datetime-local"
              value={state.lastOralIntakeIso}
              onChange={(e) => dispatch({ type: "SET_LAST_ORAL_INTAKE", value: e.target.value })}
              disabled={!editable || assessmentMutation.isPending}
              required
            />
          </div>

          <div className="flex items-center space-x-2 pt-6">
            <Checkbox
              id="npo-satisfied-checkbox"
              checked={state.npoStatusSatisfied}
              onCheckedChange={(checked) =>
                dispatch({ type: "SET_NPO", value: checked === true })
              }
              disabled={!editable || assessmentMutation.isPending}
            />
            <label
              htmlFor="npo-satisfied-checkbox"
              className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              NPO Status Satisfied (Fasting guidelines met per ASA standards)
            </label>
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="airway-notes" className="text-xs font-medium">
            Airway Assessment Notes (Dentition, neck mobility, thyromental distance)
          </label>
          <Textarea
            id="airway-notes"
            rows={2}
            value={state.airwayNotes}
            onChange={(e) => dispatch({ type: "SET_AIRWAY_NOTES", value: e.target.value })}
            placeholder="e.g. Intact dentition, full neck extension, thyromental distance > 6cm"
            disabled={!editable || assessmentMutation.isPending}
          />
        </div>

        {editable && (
          <div className="flex items-center justify-end gap-2 pt-2">
            {assessment && (
              <Button
                type="button"
                variant="outline"
                onClick={() => dispatch({ type: "SET_EDITING", value: false })}
                disabled={assessmentMutation.isPending}
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={assessmentMutation.isPending}
              data-testid="submit-pre-anesthesia-button"
            >
              <ClipboardCheck className="mr-1.5 h-4 w-4" />
              {assessmentMutation.isPending ? "Recording..." : "Verify & Attest Evaluation"}
            </Button>
          </div>
        )}
      </form>
    </SectionCard>
  );
}
