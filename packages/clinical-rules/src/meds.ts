import type { HoldRule, Medication, MedicationClass, RuleResult } from "@asc/types";
import { fromChecks } from "./result";

const GI_PROTOCOL = "Center GI endoscopy peri-procedural medication protocol (demo)";

/** Default hold rule per medication class (synthetic protocol for the mock). */
export const HOLD_RULES_BY_CLASS: Readonly<Record<MedicationClass, HoldRule | null>> = {
  anticoagulant: { daysBefore: 2, instruction: "Hold 2 days before; confirm with prescriber.", source: GI_PROTOCOL },
  antiplatelet: { daysBefore: 5, instruction: "Hold 5 days before if polypectomy likely; aspirin may continue.", source: GI_PROTOCOL },
  glp1: { daysBefore: 7, instruction: "Weekly GLP-1: hold 1 week before (aspiration risk).", source: GI_PROTOCOL },
  insulin: { daysBefore: 1, instruction: "Half dose the day before; hold morning dose.", source: GI_PROTOCOL },
  oral_hypoglycemic: { daysBefore: 1, instruction: "Hold on the morning of the procedure.", source: GI_PROTOCOL },
  iron: { daysBefore: 5, instruction: "Stop oral iron 5 days before colonoscopy.", source: GI_PROTOCOL },
  other: null,
};

/** Drug-name keywords → class (synthetic formulary for the mock; first match wins). */
const MED_CLASS_KEYWORDS: readonly (readonly [RegExp, MedicationClass])[] = [
  [/warfarin|apixaban|rivaroxaban|dabigatran|edoxaban|enoxaparin|heparin/i, "anticoagulant"],
  [/clopidogrel|prasugrel|ticagrelor/i, "antiplatelet"],
  [/semaglutide|liraglutide|dulaglutide|tirzepatide|exenatide/i, "glp1"],
  [/insulin/i, "insulin"],
  [/metformin|glipizide|glyburide|glimepiride|sitagliptin|empagliflozin|dapagliflozin/i, "oral_hypoglycemic"],
  [/ferrous|iron/i, "iron"],
];

/** Classify a medication by name (e.g. from a referral) so its hold rule applies; unknown → "other". */
export function medClassFor(name: string): MedicationClass {
  return MED_CLASS_KEYWORDS.find(([pattern]) => pattern.test(name))?.[1] ?? "other";
}

export function holdRuleFor(medClass: MedicationClass): HoldRule | null {
  return HOLD_RULES_BY_CLASS[medClass];
}

/** Every medication with a hold rule must have its hold confirmed (or be explicitly not required). */
export function medHoldCheck(medications: readonly Medication[]): RuleResult {
  return fromChecks(
    medications
      .filter((med) => med.holdRule !== null)
      .map((med) => ({
        code: `HOLD_${med.id}`,
        label: `${med.name} hold confirmed`,
        ok: med.holdStatus === "confirmed" || med.holdStatus === "not_required",
        message:
          med.holdStatus === "not_held"
            ? `${med.name} was not held as required (${med.holdRule?.instruction ?? ""}).`
            : `Confirm hold for ${med.name} (${med.holdRule?.instruction ?? ""}).`,
      })),
  );
}
