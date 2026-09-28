/**
 * Post-Anesthesia Discharge Scoring System (PADSS, Chung 1995) — optional home-readiness check
 * alongside the Aldrete score. 5 criteria scored 0–2; ≥ 9 = fit for discharge home with an escort.
 */

export type PadssCriterion = "vitals" | "activity" | "nauseaVomiting" | "pain" | "bleeding";
export type PadssInput = Readonly<Record<PadssCriterion, 0 | 1 | 2>>;

export const PADSS_DISCHARGE_MIN = 9;

export const PADSS_CRITERIA: readonly { readonly key: PadssCriterion; readonly label: string; readonly levels: readonly [string, string, string] }[] = [
  { key: "vitals", label: "Vital signs", levels: [">40 % of pre-op", "20–40 % of pre-op", "Within 20 % of pre-op"] },
  { key: "activity", label: "Activity", levels: ["Unable to ambulate", "Requires assistance", "Steady gait, no dizziness"] },
  { key: "nauseaVomiting", label: "Nausea / vomiting", levels: ["Severe", "Moderate", "Minimal"] },
  { key: "pain", label: "Pain", levels: ["Not controlled", "Controlled with IV meds", "Controlled with oral meds"] },
  { key: "bleeding", label: "Surgical bleeding", levels: ["Severe", "Moderate", "Minimal"] },
];

export function padssTotal(input: PadssInput): number {
  return PADSS_CRITERIA.reduce((sum, { key }) => sum + input[key], 0);
}
