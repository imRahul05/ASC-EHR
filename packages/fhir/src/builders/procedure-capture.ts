import type { Observation, ObservationComponent } from "@medplum/fhirtypes";
import type {
  ProcedureEvent,
  ProcedureEventType,
  StaffRef,
  TimeOutChecklist,
  TimeOutParticipant,
  TimeOutParticipantRole,
  TimeOutRecord,
  TimeOutRole,
} from "@asc/types";

import { facilityMeta, fhirId, instant, narrativeText, reference } from "@asc/fhir/builders/common";
import { type FhirUrls, fhirUrls, LOINC_CODES } from "@asc/fhir/urls";

export interface BuildSurgicalTimeOutObservationInput {
  readonly facilityId: string;
  readonly caseId: string;
  readonly patientId: string;
  readonly checklist: TimeOutChecklist;
  readonly participants: readonly TimeOutParticipant[];
  readonly completedAt?: string;
  readonly id?: string;
}

const CHECKLIST_KEYS: readonly (keyof TimeOutChecklist)[] = [
  "patientIdentity", "procedureConfirmed", "consentVerified", "allergiesReviewed",
  "equipmentReady", "anticoagulationReviewed", "siteAndLateralityConfirmed",
  "prophylaxisReviewed", "anticipatedIssuesReviewed",
];

const PARTICIPANT_TO_ATTESTATION_ROLE: Record<TimeOutParticipantRole, TimeOutRole> = {
  circulating_rn: "NURSE", endoscopist: "SURGEON", anesthesia: "ANESTHESIOLOGIST", tech: "NURSE",
};

/**
 * Universal Protocol UP.01.03.01 & CMS 42 CFR § 416.52:
 * Multi-disciplinary surgical timeout observation builder.
 */
export function buildSurgicalTimeOutObservation(input: BuildSurgicalTimeOutObservationInput, urls: FhirUrls = fhirUrls): Observation {
  const facility = fhirId(input.facilityId, "facility id");
  const caseId = fhirId(input.caseId, "case id");
  const patient = fhirId(input.patientId, "patient id");
  const effectiveDate = input.completedAt !== undefined ? instant(input.completedAt, "completedAt") : new Date().toISOString();

  const components: ObservationComponent[] = [];
  for (const key of CHECKLIST_KEYS) {
    const val = input.checklist[key];
    if (val !== undefined) {
      components.push({
        code: { coding: [{ system: urls.codeSystem("timeout-checklist"), code: key, display: key }], text: key },
        valueBoolean: val,
      });
    }
  }

  for (const p of input.participants) {
    components.push({
      code: { coding: [{ system: urls.codeSystem("timeout-participant"), code: p.role, display: p.role }], text: p.name },
      valueString: JSON.stringify({ userId: p.userId, name: p.name, role: p.role, acknowledgedAt: p.acknowledgedAt }),
    });
  }

  return {
    resourceType: "Observation",
    ...(input.id !== undefined ? { id: fhirId(input.id, "observation id") } : {}),
    meta: facilityMeta(facility),
    status: "final",
    category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "procedure", display: "Procedure" }] }],
    code: { coding: [{ system: "http://loinc.org", code: LOINC_CODES.SURGICAL_TIMEOUT, display: "Surgical timeout" }], text: "Surgical Time Out" },
    subject: reference("Patient", patient),
    encounter: reference("Encounter", caseId),
    effectiveDateTime: effectiveDate,
    performer: input.participants.map((p) => reference("Practitioner", p.userId)),
    component: components,
  };
}

export function parseSurgicalTimeOutObservation(obs: Observation): TimeOutRecord {
  const caseId = obs.encounter?.reference?.replace(/^Encounter\//, "") ?? "";
  const checklistPartial: Partial<Record<keyof TimeOutChecklist, boolean>> = {};
  const participants: TimeOutParticipant[] = [];

  for (const comp of obs.component ?? []) {
    const code = comp.code?.coding?.[0]?.code;
    const system = comp.code?.coding?.[0]?.system;

    if (system?.includes("timeout-checklist") && code) {
      checklistPartial[code as keyof TimeOutChecklist] = comp.valueBoolean ?? false;
    } else if (system?.includes("timeout-participant") && comp.valueString) {
      try {
        participants.push(JSON.parse(comp.valueString) as TimeOutParticipant);
      } catch {
        // Ignore unparseable participant string
      }
    }
  }

  const checklist: TimeOutChecklist = {
    patientIdentity: checklistPartial.patientIdentity ?? false,
    procedureConfirmed: checklistPartial.procedureConfirmed ?? false,
    consentVerified: checklistPartial.consentVerified ?? false,
    allergiesReviewed: checklistPartial.allergiesReviewed ?? false,
    equipmentReady: checklistPartial.equipmentReady ?? false,
    anticoagulationReviewed: checklistPartial.anticoagulationReviewed ?? false,
    ...(checklistPartial.siteAndLateralityConfirmed !== undefined ? { siteAndLateralityConfirmed: checklistPartial.siteAndLateralityConfirmed } : {}),
    ...(checklistPartial.prophylaxisReviewed !== undefined ? { prophylaxisReviewed: checklistPartial.prophylaxisReviewed } : {}),
    ...(checklistPartial.anticipatedIssuesReviewed !== undefined ? { anticipatedIssuesReviewed: checklistPartial.anticipatedIssuesReviewed } : {}),
  };

  const attestations = participants.map((p) => ({
    role: PARTICIPANT_TO_ATTESTATION_ROLE[p.role],
    by: { id: p.userId, name: p.name, initials: p.name.slice(0, 2).toUpperCase() },
    at: p.acknowledgedAt,
  }));

  return {
    caseId,
    checklist,
    attestations,
    participants,
    fhirObservationId: obs.id,
    completedAt: obs.effectiveDateTime,
  };
}

export interface BuildProcedureEventObservationInput {
  readonly facilityId: string;
  readonly caseId: string;
  readonly patientId: string;
  readonly event: ProcedureEvent;
}

export function buildProcedureEventObservation(input: BuildProcedureEventObservationInput, urls: FhirUrls = fhirUrls): Observation {
  const facility = fhirId(input.facilityId, "facility id");
  const caseId = fhirId(input.caseId, "case id");
  const patient = fhirId(input.patientId, "patient id");
  const eventTime = instant(input.event.at, "event.at");

  return {
    resourceType: "Observation",
    id: fhirId(input.event.id, "event id"),
    meta: facilityMeta(facility),
    status: "final",
    category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "procedure", display: "Procedure" }] }],
    code: { coding: [{ system: "http://loinc.org", code: LOINC_CODES.INTRAOP_EVENT, display: "Procedure event" }], text: input.event.type },
    subject: reference("Patient", patient),
    encounter: reference("Encounter", caseId),
    effectiveDateTime: eventTime,
    performer: [reference("Practitioner", input.event.by.id)],
    valueCodeableConcept: {
      coding: [{ system: urls.codeSystem("procedure-event-type"), code: input.event.type, display: input.event.type }],
    },
    component: [{
      code: { coding: [{ system: urls.codeSystem("event-performer"), code: "staff", display: "Event Recorded By" }], text: "Event Recorded By" },
      valueString: JSON.stringify(input.event.by),
    }],
    ...(input.event.note !== undefined ? { note: [{ text: narrativeText(input.event.note, "note") }] } : {}),
  };
}

export function parseProcedureEventObservation(obs: Observation): ProcedureEvent {
  const id = obs.id ?? "";
  const caseId = obs.encounter?.reference?.replace(/^Encounter\//, "") ?? "";
  const type = (obs.valueCodeableConcept?.coding?.[0]?.code ?? "ROOM_IN") as ProcedureEventType;
  const at = obs.effectiveDateTime ?? "";
  const note = obs.note?.[0]?.text;

  let by: StaffRef = { id: obs.performer?.[0]?.reference?.replace(/^Practitioner\//, "") ?? "unknown", name: "Staff", initials: "ST" };
  const perfComp = obs.component?.find((c) => c.code?.coding?.[0]?.code === "staff");
  if (perfComp?.valueString) {
    try {
      by = JSON.parse(perfComp.valueString) as StaffRef;
    } catch {
      // Fall back to performer ref
    }
  }

  return {
    id,
    caseId,
    type,
    at,
    by,
    ...(note !== undefined ? { note } : {}),
  };
}
