/** Default scheduled duration in minutes keyed by primary procedure CPT code. */
export const DEFAULT_DURATION_BY_CPT: Readonly<Record<string, number>> = {
  "45378": 45,
  "43239": 30,
  "45385": 45,
  "45380": 45,
  "43235": 30,
  "45330": 30,
};

export const DEFAULT_PROCEDURE_DURATION_MINUTES = 45;

export function defaultDurationForCpt(cptCode?: string): number {
  if (!cptCode) return DEFAULT_PROCEDURE_DURATION_MINUTES;
  return DEFAULT_DURATION_BY_CPT[cptCode] ?? DEFAULT_PROCEDURE_DURATION_MINUTES;
}
