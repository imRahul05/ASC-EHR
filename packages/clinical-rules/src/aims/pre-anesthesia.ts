/**
 * Pre-Anesthesia Medical Evaluation & Airway Readiness Rule Engine.
 *
 * US Healthcare Regulations & Clinical Standards:
 * - CMS 42 CFR § 416.42(a) Condition for Coverage: Surgical and Anesthesia Services:
 *   Mandatory pre-anesthesia evaluation conducted immediately prior to surgery by a qualified practitioner.
 * - ASA Physical Status Classification System (ASA I–V):
 *   Patients with ASA Class IV/V represent severe systemic disease that is a constant threat to life;
 *   requires medical director clearance in an ambulatory surgical center setting.
 * - ASA Practice Guidelines for Preoperative Fasting:
 *   Requires confirmed adherence to NPO guidelines (minimum 2h clear liquids, 6h light meal)
 *   to avoid pulmonary aspiration during sedation.
 */

import type { PreAnesthesiaAssessment, RuleResult } from "@asc/types";
import { fromChecks } from "@asc/clinical-rules/result";

/**
 * Evaluates whether pre-anesthesia assessment meets CMS 42 CFR § 416.42(a)
 * conditions for coverage before procedural sedation may begin.
 *
 * @param assessment - Pre-anesthesia medical assessment document.
 */
export function evaluatePreAnesthesiaReadiness(
  assessment?: PreAnesthesiaAssessment | null,
): RuleResult {
  const isAssessed = Boolean(assessment && assessment.assessedAt);
  const npoOk = Boolean(assessment && assessment.npoStatusSatisfied);
  const asaOk = Boolean(assessment && assessment.asaClass >= 1 && assessment.asaClass <= 3);
  const asaSevere = Boolean(assessment && assessment.asaClass >= 4);
  const medicalDirectorOverride = Boolean(assessment?.medicalDirectorCleared);

  return fromChecks([
    {
      code: "PRE_ANESTHESIA_EVAL_COMPLETE",
      label: "Pre-anesthesia evaluation documented (CMS 42 CFR § 416.42(a))",
      ok: isAssessed,
      message: isAssessed
        ? ""
        : "Pre-anesthesia medical evaluation must be completed immediately prior to sedation.",
    },
    {
      code: "ASA_PHYSICAL_STATUS_ELIGIBLE",
      label: "ASA Physical Status acceptable for ASC sedation",
      ok: isAssessed && (asaOk || medicalDirectorOverride),
      message: !isAssessed
        ? "ASA physical status classification not yet documented."
        : asaSevere && !medicalDirectorOverride
          ? `ASA Class ${assessment?.asaClass} presents severe systemic instability requiring medical director clearance.`
          : "",
    },
    {
      code: "NPO_FASTING_SATISFIED",
      label: "NPO fasting guidelines verified",
      ok: isAssessed && npoOk,
      message: !isAssessed
        ? "NPO status fasting compliance not yet documented."
        : npoOk
          ? ""
          : "NPO fasting status unsatisfied; patient does not meet minimum pulmonary aspiration safety guidelines.",
    },
  ]);
}

/**
 * Computes elapsed billable anesthesia minutes between sedation start and sedation end.
 * Returns null if sedation start timestamp is absent or invalid.
 *
 * @param sedationStartIso - ISO timestamp when sedation was initiated.
 * @param sedationEndIso - ISO timestamp when sedation was terminated.
 */
export function anesthesiaMinutes(
  sedationStartIso?: string,
  sedationEndIso?: string,
): number | null {
  if (!sedationStartIso) return null;

  const startMs = Date.parse(sedationStartIso);
  if (isNaN(startMs)) return null;

  const endMs = sedationEndIso ? Date.parse(sedationEndIso) : Date.now();
  if (isNaN(endMs)) return null;

  if (endMs < startMs) return 0;

  return Math.round((endMs - startMs) / 60_000);
}
