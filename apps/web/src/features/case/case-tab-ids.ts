import type { CasePhase } from "@asc/types";

/**
 * Case tab ids in workflow order, with no component imports, so shell code (help sheet, guide)
 * can read them without pulling every case tab into its routes. Components live in `case-tabs.ts`.
 */
export const CASE_TAB_IDS = [
  "pre-procedure",
  "pre-op",
  "procedure",
  "anesthesia",
  "note",
  "recovery",
  "coding",
  "pathology",
] as const;

type CaseTabId = (typeof CASE_TAB_IDS)[number];

/** Tab opened when the URL has no `?tab=` — follows where the case is in the workflow. */
export const DEFAULT_TAB_BY_PHASE: Readonly<Record<CasePhase, CaseTabId>> = {
  SCHEDULED: "pre-procedure",
  CONFIRMED: "pre-procedure",
  ARRIVED: "pre-op",
  PRE_OP: "pre-op",
  READY_FOR_PROCEDURE: "procedure",
  IN_PROCEDURE: "procedure",
  RECOVERY: "recovery",
  READY_FOR_DISCHARGE: "recovery",
  DISCHARGED: "note",
  CHART_COMPLETE: "coding",
  CODED: "coding",
  EXPORTED: "pathology",
  CLOSED: "pathology",
  CANCELLED: "pre-procedure",
  NO_SHOW: "pre-procedure",
};

export function isCaseTab(value: string | null): value is CaseTabId {
  return CASE_TAB_IDS.some((id) => id === value);
}
