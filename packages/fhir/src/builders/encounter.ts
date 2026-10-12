import type { Encounter } from "@medplum/fhirtypes";
import { facilityMeta, instant, reference } from "@asc/fhir/builders/common";
import type { CasePhase } from "@asc/fhir/case-phase";
import {
  type CaseStage,
  ENCOUNTER_STATUS_BY_STAGE,
  type EncounterStatus,
} from "@asc/fhir/case-stage";
import { type ReadinessCheck } from "@asc/fhir/case-readiness";
import {
  casePhaseExtension,
  caseReadinessExtensions,
  caseStageExtension,
} from "@asc/fhir/extensions";
import { caseNumberIdentifier } from "@asc/fhir/identifiers";
import { type FhirUrls, fhirUrls } from "@asc/fhir/urls";

export { ENCOUNTER_STATUS_BY_STAGE } from "@asc/fhir/case-stage";

/**
 * The FHIR `Encounter.status` that goes with each legacy case phase.
 */
export const ENCOUNTER_STATUS_BY_PHASE: Readonly<Record<CasePhase, EncounterStatus>> = {
  SCHEDULED: "planned",
  CONFIRMED: "planned",
  ARRIVED: "arrived",
  PRE_OP: "in-progress",
  READY_FOR_PROCEDURE: "in-progress",
  IN_PROCEDURE: "in-progress",
  RECOVERY: "in-progress",
  READY_FOR_DISCHARGE: "in-progress",
  DISCHARGED: "finished",
  CHART_COMPLETE: "finished",
  CODED: "finished",
  EXPORTED: "finished",
  CLOSED: "finished",
  CANCELLED: "cancelled",
  NO_SHOW: "cancelled",
};

export interface CaseEncounterInput {
  readonly facilityId: string;
  readonly patientId: string;
  readonly phase?: CasePhase;
  readonly stage?: CaseStage;
  readonly readinessChecks?: readonly ReadinessCheck[];
  readonly appointmentId?: string;
  readonly caseNumber?: string;
  /** Where the patient is now (room or bay); the history of these drives the whiteboard (03 §3). */
  readonly locationId?: string;
  readonly start?: string;
  readonly end?: string;
}

/** The Encounter that IS the case (docs/product/03 §3): status, stage/phase extension, readiness checks, and facility. */
export function buildCaseEncounter(input: CaseEncounterInput, urls: FhirUrls = fhirUrls): Encounter {
  const start = input.start === undefined ? undefined : instant(input.start, "case start");
  const end = input.end === undefined ? undefined : instant(input.end, "case end");
  // A FHIR Period may not end before it starts (invariant per-1); equal is allowed.
  if (start !== undefined && end !== undefined && Date.parse(end) < Date.parse(start)) throw new Error("invalid case period range");

  if (input.stage === undefined && input.phase === undefined) {
    throw new Error("case encounter requires stage or phase");
  }

  const status: EncounterStatus = input.stage !== undefined
    ? ENCOUNTER_STATUS_BY_STAGE[input.stage]
    : ENCOUNTER_STATUS_BY_PHASE[input.phase as CasePhase];

  const extensions = [
    ...(input.stage !== undefined ? [caseStageExtension(input.stage, urls)] : []),
    ...(input.phase !== undefined ? [casePhaseExtension(input.phase, urls)] : []),
    ...(input.readinessChecks !== undefined ? caseReadinessExtensions(input.readinessChecks, urls) : []),
  ];

  return {
    resourceType: "Encounter",
    meta: facilityMeta(input.facilityId),
    status,
    class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB", display: "ambulatory" },
    extension: extensions,
    subject: reference("Patient", input.patientId, "patient id"),
    serviceProvider: reference("Organization", input.facilityId, "facility id"),
    ...(input.caseNumber === undefined ? {} : { identifier: [caseNumberIdentifier(input.caseNumber, urls)] }),
    ...(input.appointmentId === undefined ? {} : { appointment: [reference("Appointment", input.appointmentId, "appointment id")] }),
    ...(input.locationId === undefined ? {} : { location: [{ location: reference("Location", input.locationId, "location id"), status: "active" }] }),
    ...(start === undefined && end === undefined ? {} : { period: { ...(start === undefined ? {} : { start }), ...(end === undefined ? {} : { end }) } }),
  };
}
