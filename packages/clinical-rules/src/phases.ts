import type { CasePhase, CaseStage, PhaseGroup, RuleResult } from "@asc/types";
import { fail, OK } from "./result";

export type { CaseStage } from "@asc/types";

/** 12 strictly physical CaseStage values per REQ-5 §164–180. */
export const STAGE_ORDER: readonly CaseStage[] = [
  "requested",
  "scheduled",
  "confirmed",
  "arrived",
  "preop",
  "in_room",
  "procedure_start",
  "procedure_end",
  "pacu",
  "discharged",
  "cancelled",
  "no_show",
];

export const FORWARD_STAGE_ORDER: readonly CaseStage[] = [
  "requested",
  "scheduled",
  "confirmed",
  "arrived",
  "preop",
  "in_room",
  "procedure_start",
  "procedure_end",
  "pacu",
  "discharged",
];

export const STOPPED_STAGES: readonly CaseStage[] = ["cancelled", "no_show"];
export const ALL_STAGES: readonly CaseStage[] = STAGE_ORDER;

/**
 * PHASE_ORDER reflects the strictly sequential 12 CaseStage values per REQ-5 §164–180.
 */
export const PHASE_ORDER: readonly CaseStage[] = STAGE_ORDER;
export const STOPPED_PHASES: readonly (CaseStage | CasePhase)[] = [...STOPPED_STAGES, "CANCELLED", "NO_SHOW"];

export const LEGACY_PHASE_ORDER: readonly CasePhase[] = [
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
export const LEGACY_STOPPED_PHASES: readonly CasePhase[] = ["CANCELLED", "NO_SHOW"];
export const LEGACY_ALL_PHASES: readonly CasePhase[] = [...LEGACY_PHASE_ORDER, ...LEGACY_STOPPED_PHASES];

export const ALL_PHASES: readonly (CaseStage | CasePhase)[] = [...ALL_STAGES, ...LEGACY_ALL_PHASES];

export const STAGE_GROUP: Readonly<Record<CaseStage, PhaseGroup>> = {
  requested: "scheduling",
  scheduled: "scheduling",
  confirmed: "scheduling",
  arrived: "dayof",
  preop: "dayof",
  in_room: "procedure",
  procedure_start: "procedure",
  procedure_end: "procedure",
  pacu: "recovery",
  discharged: "post",
  cancelled: "stopped",
  no_show: "stopped",
};

export const PHASE_GROUP: Readonly<Record<CasePhase | CaseStage, PhaseGroup>> = {
  ...STAGE_GROUP,
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

export const STAGE_LABEL: Readonly<Record<CaseStage, string>> = {
  requested: "Requested",
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  arrived: "Arrived",
  preop: "Pre-op",
  in_room: "In room",
  procedure_start: "Procedure start",
  procedure_end: "Procedure end",
  pacu: "PACU",
  discharged: "Discharged",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export const PHASE_LABEL: Readonly<Record<CasePhase | CaseStage, string>> = {
  ...STAGE_LABEL,
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

export const STAGE_ACTION_LABEL: Readonly<Record<CaseStage, string>> = {
  requested: "Request case",
  scheduled: "Schedule",
  confirmed: "Confirm case",
  arrived: "Check in",
  preop: "Start pre-op",
  in_room: "Move to room",
  procedure_start: "Start procedure",
  procedure_end: "End procedure",
  pacu: "Move to PACU",
  discharged: "Discharge",
  cancelled: "Cancel case",
  no_show: "Mark no-show",
};

export const PHASE_ACTION_LABEL: Readonly<Record<CasePhase | CaseStage, string>> = {
  ...STAGE_ACTION_LABEL,
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

export const FORWARD_TRANSITIONS: Readonly<Record<CaseStage, readonly CaseStage[]>> = {
  requested: ["scheduled", "cancelled"],
  scheduled: ["confirmed", "cancelled", "no_show"],
  confirmed: ["arrived", "cancelled", "no_show"],
  arrived: ["preop", "cancelled", "no_show"],
  preop: ["in_room", "cancelled"],
  in_room: ["procedure_start", "cancelled"],
  procedure_start: ["procedure_end", "cancelled"],
  procedure_end: ["pacu", "cancelled"],
  pacu: ["discharged", "cancelled"],
  discharged: [],
  cancelled: [],
  no_show: [],
};

/**
 * Permitted logged stage reversals per REQ-5 §179:
 * "Stage transitions are strictly forward except for explicit, logged reversals (a patient returned from the room to pre-op)."
 */
export const STAGE_REVERSALS: Readonly<Record<CaseStage, readonly CaseStage[]>> = {
  requested: [],
  scheduled: ["requested"],
  confirmed: ["scheduled"],
  arrived: ["confirmed"],
  preop: ["arrived"],
  in_room: ["preop"],
  procedure_start: ["in_room"],
  procedure_end: ["procedure_start"],
  pacu: ["in_room", "preop"],
  discharged: ["pacu"],
  cancelled: [],
  no_show: [],
};

export const ALLOWED_STAGE_TRANSITIONS: Readonly<Record<CaseStage, readonly CaseStage[]>> = {
  requested: ["scheduled", "cancelled"],
  scheduled: ["confirmed", "requested", "cancelled", "no_show"],
  confirmed: ["arrived", "scheduled", "cancelled", "no_show"],
  arrived: ["preop", "confirmed", "cancelled", "no_show"],
  preop: ["in_room", "arrived", "cancelled"],
  in_room: ["procedure_start", "preop", "cancelled"],
  procedure_start: ["procedure_end", "in_room", "cancelled"],
  procedure_end: ["pacu", "procedure_start", "cancelled"],
  pacu: ["discharged", "in_room", "preop", "cancelled"],
  discharged: ["pacu"],
  cancelled: [],
  no_show: [],
};

export const ALLOWED_LEGACY_TRANSITIONS: Readonly<Record<CasePhase, readonly CasePhase[]>> = {
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

export const ALLOWED_TRANSITIONS: Readonly<Record<CasePhase, readonly CasePhase[]>> &
  Readonly<Record<CaseStage, readonly CaseStage[]>> = {
  ...ALLOWED_STAGE_TRANSITIONS,
  ...ALLOWED_LEGACY_TRANSITIONS,
};

export function isStageReversal(from: CaseStage, to: CaseStage): boolean {
  return Object.hasOwn(STAGE_REVERSALS, from) && STAGE_REVERSALS[from].includes(to);
}

export function isCaseStage(value: CasePhase | CaseStage): value is CaseStage {
  return Object.hasOwn(STAGE_LABEL, value);
}

export function nextStage(stage: CaseStage): CaseStage | null {
  return FORWARD_TRANSITIONS[stage]?.find((to) => !STOPPED_STAGES.includes(to)) ?? null;
}

export function nextPhase(stage: CaseStage): CaseStage | null;
export function nextPhase(phase: CasePhase): CasePhase | null;
export function nextPhase(phase: CasePhase | CaseStage): (CasePhase | CaseStage) | null;
export function nextPhase(phase: CasePhase | CaseStage): (CasePhase | CaseStage) | null {
  if (isCaseStage(phase)) {
    return nextStage(phase);
  }
  return ALLOWED_LEGACY_TRANSITIONS[phase]?.find((to) => !STOPPED_PHASES.includes(to)) ?? null;
}

export const STAGE_FROM_PHASE: Readonly<Record<CasePhase, CaseStage>> = {
  SCHEDULED: "scheduled",
  CONFIRMED: "confirmed",
  ARRIVED: "arrived",
  PRE_OP: "preop",
  READY_FOR_PROCEDURE: "preop",
  IN_PROCEDURE: "procedure_start",
  RECOVERY: "pacu",
  READY_FOR_DISCHARGE: "pacu",
  DISCHARGED: "discharged",
  CHART_COMPLETE: "discharged",
  CODED: "discharged",
  EXPORTED: "discharged",
  CLOSED: "discharged",
  CANCELLED: "cancelled",
  NO_SHOW: "no_show",
};

export function stageFromPhase(phase: CasePhase): CaseStage {
  return STAGE_FROM_PHASE[phase];
}

export function transitionAllowed(from: CasePhase | CaseStage, to: CasePhase | CaseStage): RuleResult {
  if (isCaseStage(from) && isCaseStage(to)) {
    const allowed = ALLOWED_STAGE_TRANSITIONS[from];
    if (allowed.includes(to)) return OK;
    return fail("TRANSITION_NOT_ALLOWED", `A case cannot move from ${STAGE_LABEL[from]} to ${STAGE_LABEL[to]}.`);
  }

  if (!isCaseStage(from) && !isCaseStage(to)) {
    const allowed = ALLOWED_LEGACY_TRANSITIONS[from];
    if (allowed.includes(to)) return OK;
    return fail("TRANSITION_NOT_ALLOWED", `A case cannot move from ${PHASE_LABEL[from]} to ${PHASE_LABEL[to]}.`);
  }

  // Cross-compatibility between CasePhase and CaseStage
  const fromStage = isCaseStage(from) ? from : stageFromPhase(from);
  const toStage = isCaseStage(to) ? to : stageFromPhase(to);
  const allowed = ALLOWED_STAGE_TRANSITIONS[fromStage];
  if (allowed.includes(toStage)) return OK;

  const fromLabel = PHASE_LABEL[from] ?? String(from);
  const toLabel = PHASE_LABEL[to] ?? String(to);
  return fail("TRANSITION_NOT_ALLOWED", `A case cannot move from ${fromLabel} to ${toLabel}.`);
}

export function stageIndex(stage: CaseStage): number {
  if (STOPPED_STAGES.includes(stage)) return -1;
  return FORWARD_STAGE_ORDER.indexOf(stage);
}

export function phaseIndex(phase: CasePhase | CaseStage): number {
  if (isCaseStage(phase)) {
    return stageIndex(phase);
  }
  const legacyOrder: readonly string[] = [
    "SCHEDULED", "CONFIRMED", "ARRIVED", "PRE_OP", "READY_FOR_PROCEDURE",
    "IN_PROCEDURE", "RECOVERY", "READY_FOR_DISCHARGE", "DISCHARGED",
    "CHART_COMPLETE", "CODED", "EXPORTED", "CLOSED",
  ];
  return legacyOrder.indexOf(String(phase));
}

export function isPhaseAtLeast(phase: CasePhase | CaseStage, target: CasePhase | CaseStage): boolean {
  const index = phaseIndex(phase);
  const targetIndex = phaseIndex(target);
  return index >= 0 && targetIndex >= 0 && index >= targetIndex;
}

/**
 * Predicate to determine if a case is physically occupying an operating/procedure room.
 * Covers both CaseStage values ("in_room", "procedure_start", "procedure_end")
 * and legacy/display phase strings.
 */
export function isRoomOccupyingPhase(phase?: string | null): boolean {
  if (!phase) return false;
  const normalized = phase.trim().toLowerCase();
  return (
    normalized === "in_room" ||
    normalized === "procedure_start" ||
    normalized === "procedure_end" ||
    normalized === "in_procedure" ||
    normalized === "ready_for_procedure" ||
    normalized === "in_progress"
  );
}

