import type { CasePhase, PhaseGroup, RuleResult } from "@asc/types";
import { fail, OK } from "./result";

/** Happy-path order of the case state machine (docs/product/04-end-to-end-flows.md §4.2). */
export const PHASE_ORDER: readonly CasePhase[] = [
  "SCHEDULED",
  "CONFIRMED",
  "ARRIVED",
  "PRE_OP",
  "READY_FOR_PROCEDURE",
  "IN_PROCEDURE",
  "RECOVERY",
  "READY_FOR_DISCHARGE",
  "DISCHARGED",
  "CHART_COMPLETE",
  "CODED",
  "EXPORTED",
  "CLOSED",
];

export const STOPPED_PHASES: readonly CasePhase[] = ["CANCELLED", "NO_SHOW"];
export const ALL_PHASES: readonly CasePhase[] = [...PHASE_ORDER, ...STOPPED_PHASES];

export const PHASE_GROUP: Readonly<Record<CasePhase, PhaseGroup>> = {
  SCHEDULED: "scheduling",
  CONFIRMED: "scheduling",
  ARRIVED: "dayof",
  PRE_OP: "dayof",
  READY_FOR_PROCEDURE: "dayof",
  IN_PROCEDURE: "procedure",
  RECOVERY: "recovery",
  READY_FOR_DISCHARGE: "recovery",
  DISCHARGED: "post",
  CHART_COMPLETE: "post",
  CODED: "post",
  EXPORTED: "post",
  CLOSED: "post",
  CANCELLED: "stopped",
  NO_SHOW: "stopped",
};

export const PHASE_GROUP_ORDER: readonly PhaseGroup[] = ["scheduling", "dayof", "procedure", "recovery", "post", "stopped"];

export const PHASE_GROUP_LABEL: Readonly<Record<PhaseGroup, string>> = {
  scheduling: "Scheduling",
  dayof: "Day of",
  procedure: "Procedure",
  recovery: "Recovery",
  post: "Post-op",
  stopped: "Stopped",
};

export const PHASE_LABEL: Readonly<Record<CasePhase, string>> = {
  SCHEDULED: "Scheduled",
  CONFIRMED: "Confirmed",
  ARRIVED: "Arrived",
  PRE_OP: "Pre-op",
  READY_FOR_PROCEDURE: "Ready",
  IN_PROCEDURE: "In procedure",
  RECOVERY: "Recovery",
  READY_FOR_DISCHARGE: "Ready for discharge",
  DISCHARGED: "Discharged",
  CHART_COMPLETE: "Chart complete",
  CODED: "Coded",
  EXPORTED: "Exported",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};

/** Verb shown on the primary "advance" button that moves a case INTO the phase. */
export const PHASE_ACTION_LABEL: Readonly<Record<CasePhase, string>> = {
  SCHEDULED: "Schedule",
  CONFIRMED: "Confirm case",
  ARRIVED: "Check in",
  PRE_OP: "Start pre-op",
  READY_FOR_PROCEDURE: "Mark ready",
  IN_PROCEDURE: "Start procedure",
  RECOVERY: "End procedure",
  READY_FOR_DISCHARGE: "Ready for discharge",
  DISCHARGED: "Discharge",
  CHART_COMPLETE: "Complete chart",
  CODED: "Mark coded",
  EXPORTED: "Mark exported",
  CLOSED: "Close case",
  CANCELLED: "Cancel case",
  NO_SHOW: "Mark no-show",
};

export const ALLOWED_TRANSITIONS: Readonly<Record<CasePhase, readonly CasePhase[]>> = {
  SCHEDULED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["ARRIVED", "CANCELLED", "NO_SHOW"],
  ARRIVED: ["PRE_OP", "CANCELLED"],
  PRE_OP: ["READY_FOR_PROCEDURE", "CANCELLED"],
  READY_FOR_PROCEDURE: ["IN_PROCEDURE", "CANCELLED"],
  IN_PROCEDURE: ["RECOVERY"],
  RECOVERY: ["READY_FOR_DISCHARGE"],
  READY_FOR_DISCHARGE: ["DISCHARGED"],
  DISCHARGED: ["CHART_COMPLETE"],
  CHART_COMPLETE: ["CODED"],
  CODED: ["EXPORTED"],
  EXPORTED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

/** The forward (non-stop) transition from a phase, if any — drives the "advance phase" action. */
export function nextPhase(phase: CasePhase): CasePhase | null {
  return ALLOWED_TRANSITIONS[phase].find((to) => !STOPPED_PHASES.includes(to)) ?? null;
}

export function transitionAllowed(from: CasePhase, to: CasePhase): RuleResult {
  if (ALLOWED_TRANSITIONS[from].includes(to)) return OK;
  return fail("TRANSITION_NOT_ALLOWED", `A case cannot move from ${PHASE_LABEL[from]} to ${PHASE_LABEL[to]}.`);
}

/** Index in PHASE_ORDER (-1 for cancelled / no-show). */
export function phaseIndex(phase: CasePhase): number {
  return PHASE_ORDER.indexOf(phase);
}

/** True when `phase` is `target` or later on the happy path. */
export function isPhaseAtLeast(phase: CasePhase, target: CasePhase): boolean {
  const index = phaseIndex(phase);
  return index >= 0 && index >= phaseIndex(target);
}
