import type { CaseStage } from "@asc/types";
import type { CodeSystem, Encounter } from "@medplum/fhirtypes";
import { type FhirUrls, fhirUrls } from "@asc/fhir/urls";

export type { CaseStage } from "@asc/types";

export type EncounterStatus = NonNullable<Encounter["status"]>;

/**
 * Standard FHIR Encounter.status mapping for each CaseStage per REQ-5 §164–180.
 * Decouples physical patient location from clinical readiness.
 */
export const ENCOUNTER_STATUS_BY_STAGE: Readonly<Record<CaseStage, EncounterStatus>> = {
  requested: "planned",
  scheduled: "planned",
  confirmed: "planned",
  arrived: "arrived",
  preop: "in-progress",
  in_room: "in-progress",
  procedure_start: "in-progress",
  procedure_end: "in-progress",
  pacu: "in-progress",
  discharged: "finished",
  cancelled: "cancelled",
  no_show: "cancelled",
};

export function caseStageEncounterStatus(stage: CaseStage): EncounterStatus {
  return ENCOUNTER_STATUS_BY_STAGE[stage];
}

export const encounterStatusFromStage = caseStageEncounterStatus;

interface StageMetadata {
  readonly code: string;
  readonly display: string;
  readonly definition: string;
}

const CASE_STAGES: Readonly<Record<CaseStage, StageMetadata>> = {
  requested: { code: "requested", display: "Requested", definition: "Referral received, not yet scheduled" },
  scheduled: { code: "scheduled", display: "Scheduled", definition: "Date, room and physician assigned" },
  confirmed: { code: "confirmed", display: "Confirmed", definition: "Patient has confirmed attendance" },
  arrived: { code: "arrived", display: "Arrived", definition: "Patient physically present" },
  preop: { code: "preop", display: "Pre-op", definition: "In a pre-op bay" },
  in_room: { code: "in-room", display: "In room", definition: "In the procedure room" },
  procedure_start: { code: "procedure-start", display: "Procedure start", definition: "Scope in" },
  procedure_end: { code: "procedure-end", display: "Procedure end", definition: "Scope out" },
  pacu: { code: "pacu", display: "PACU", definition: "In recovery" },
  discharged: { code: "discharged", display: "Discharged", definition: "Left the building" },
  cancelled: { code: "cancelled", display: "Cancelled", definition: "Will not happen" },
  no_show: { code: "no-show", display: "No show", definition: "Did not arrive" },
};

const STAGE_BY_CODE: ReadonlyMap<string, CaseStage> = new Map([
  ...Object.entries(CASE_STAGES).map(([stage, meta]) => [meta.code, stage as CaseStage] as const),
  ["in_room", "in_room"],
  ["procedure_start", "procedure_start"],
  ["procedure_end", "procedure_end"],
  ["no_show", "no_show"],
  ["pre-op", "preop"],
]);

export function caseStageCode(stage: CaseStage): string {
  return CASE_STAGES[stage].code;
}

export function caseStageDisplay(stage: CaseStage): string {
  return CASE_STAGES[stage].display;
}

export function caseStageDefinition(stage: CaseStage): string {
  return CASE_STAGES[stage].definition;
}

export function caseStageFromCode(code: string): CaseStage | undefined {
  return STAGE_BY_CODE.get(code);
}

/**
 * The CodeSystem for CaseStage (Medplum CodeSystem/case-stage).
 * Represents the 12 strictly physical patient locations defined in REQ-5 §164–180.
 */
export function buildCaseStageCodeSystem(urls: FhirUrls = fhirUrls): CodeSystem {
  return {
    resourceType: "CodeSystem",
    url: urls.codeSystem("case-stage"),
    name: "CaseStage",
    title: "Case stage",
    status: "active",
    content: "complete",
    caseSensitive: true,
    description: "Physical stage of a surgical case (Encounter), strictly decoupled from readiness checks (REQ-5 §164–180).",
    concept: Object.values(CASE_STAGES).map(({ code, display, definition }) => ({
      code,
      display,
      definition,
    })),
  };
}
