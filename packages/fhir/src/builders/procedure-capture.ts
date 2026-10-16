import type { Observation, ObservationComponent } from "@medplum/fhirtypes";
import type {
  Gate2OverrideRecord,
  ProcedureEvent,
  ProcedureEventType,
  ScopeAssignmentRecord,
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
  circulating_rn: "NURSE", endoscopist: "SURGEON", anesthesia: "ANESTHESIOLOGIST", tech: "TECH",
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

export interface BuildWithdrawalTimeObservationInput {
  readonly facilityId: string;
  readonly caseId: string;
  readonly patientId: string;
  readonly withdrawalTimeMinutes: number;
  readonly meetsQualityBenchmark: boolean;
  readonly recordedAt?: string;
  readonly performerId?: string;
  readonly id?: string;
}

/**
 * ASGE/ACG 2022 Quality Indicators for Colonoscopy:
 * Withdrawal time >= 6.0 minutes observation builder.
 */
export function buildWithdrawalTimeObservation(input: BuildWithdrawalTimeObservationInput, urls: FhirUrls = fhirUrls): Observation {
  const facility = fhirId(input.facilityId, "facility id");
  const caseId = fhirId(input.caseId, "case id");
  const patient = fhirId(input.patientId, "patient id");
  const effectiveDate = input.recordedAt !== undefined ? instant(input.recordedAt, "recordedAt") : new Date().toISOString();

  return {
    resourceType: "Observation",
    ...(input.id !== undefined ? { id: fhirId(input.id, "observation id") } : {}),
    meta: facilityMeta(facility),
    status: "final",
    category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "procedure", display: "Procedure" }] }],
    code: { coding: [{ system: "http://loinc.org", code: LOINC_CODES.WITHDRAWAL_TIME, display: "Endoscopic procedure withdrawal time" }], text: "Endoscopic Procedure Withdrawal Time" },
    subject: reference("Patient", patient),
    encounter: reference("Encounter", caseId),
    effectiveDateTime: effectiveDate,
    valueQuantity: { value: input.withdrawalTimeMinutes, unit: "min", system: "http://unitsofmeasure.org", code: "min" },
    component: [{
      code: { coding: [{ system: urls.codeSystem("withdrawal-quality-benchmark"), code: "asge-6min", display: "Meets ASGE >= 6 min Quality Benchmark" }], text: "Meets ASGE >= 6 min Quality Benchmark" },
      valueBoolean: input.meetsQualityBenchmark,
    }],
    ...(input.performerId !== undefined ? { performer: [reference("Practitioner", input.performerId)] } : {}),
  };
}

export function parseWithdrawalTimeObservation(obs: Observation): { readonly withdrawalTimeMinutes: number; readonly meetsQualityBenchmark: boolean } {
  const withdrawalTimeMinutes = obs.valueQuantity?.value ?? 0;
  const benchmarkComp = obs.component?.find((c) => c.code?.coding?.[0]?.code === "asge-6min");
  const meetsQualityBenchmark = benchmarkComp?.valueBoolean ?? false;
  return { withdrawalTimeMinutes, meetsQualityBenchmark };
}

export interface BuildScopeVerificationObservationInput {
  readonly facilityId: string;
  readonly caseId: string;
  readonly patientId: string;
  readonly scopeAssignment: ScopeAssignmentRecord;
  readonly id?: string;
}

/**
 * ANSI/AAMI ST91:2021 & CMS 42 CFR § 416.51:
 * Endoscope reprocessing verification and 168-hour hang-time record.
 */
export function buildScopeVerificationObservation(input: BuildScopeVerificationObservationInput, urls: FhirUrls = fhirUrls): Observation {
  const facility = fhirId(input.facilityId, "facility id");
  const caseId = fhirId(input.caseId, "case id");
  const patient = fhirId(input.patientId, "patient id");
  const assignedAt = instant(input.scopeAssignment.assignedAt, "assignedAt");
  const reprocessedAt = instant(input.scopeAssignment.reprocessedAt, "reprocessedAt");

  const components: ObservationComponent[] = [
    { code: { coding: [{ system: urls.codeSystem("scope-verification"), code: "serial", display: "Scope Serial Number" }], text: "Scope Serial Number" }, valueString: input.scopeAssignment.scopeSerial },
    { code: { coding: [{ system: urls.codeSystem("scope-verification"), code: "reprocessedAt", display: "Reprocessed At" }], text: "Reprocessed At" }, valueDateTime: reprocessedAt },
    { code: { coding: [{ system: urls.codeSystem("scope-verification"), code: "leakTest", display: "Leak Test Result" }], text: "Leak Test Result" }, valueString: input.scopeAssignment.leakTestResult },
    { code: { coding: [{ system: urls.codeSystem("scope-verification"), code: "cycleOutcome", display: "AER Cycle Outcome" }], text: "AER Cycle Outcome" }, valueString: input.scopeAssignment.cycleOutcome },
    { code: { coding: [{ system: urls.codeSystem("scope-verification"), code: "hangTimeHours", display: "Hang Time Hours" }], text: "Hang Time Hours" }, valueQuantity: { value: input.scopeAssignment.hangTimeHours, unit: "h", system: "http://unitsofmeasure.org", code: "h" } },
    { code: { coding: [{ system: urls.codeSystem("scope-verification"), code: "withinHangTimeWindow", display: "Within Hang Time Window" }], text: "Within Hang Time Window" }, valueBoolean: input.scopeAssignment.withinHangTimeWindow },
    { code: { coding: [{ system: urls.codeSystem("scope-verification"), code: "assignedBy", display: "Assigned By" }], text: "Assigned By" }, valueString: JSON.stringify(input.scopeAssignment.assignedBy) },
  ];

  if (input.scopeAssignment.scopeModel !== undefined) {
    components.push({
      code: { coding: [{ system: urls.codeSystem("scope-verification"), code: "model", display: "Scope Model" }], text: "Scope Model" },
      valueString: input.scopeAssignment.scopeModel,
    });
  }

  const obsId = input.id ?? input.scopeAssignment.fhirObservationId;

  return {
    resourceType: "Observation",
    ...(obsId !== undefined ? { id: fhirId(obsId, "observation id") } : {}),
    meta: facilityMeta(facility),
    status: "final",
    category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "procedure", display: "Procedure" }] }],
    code: { coding: [{ system: "http://loinc.org", code: LOINC_CODES.SCOPE_VERIFICATION, display: "Equipment decontamination and sterilization record" }], text: "Endoscope Reprocessing and Verification Record" },
    subject: reference("Patient", patient),
    encounter: reference("Encounter", caseId),
    effectiveDateTime: assignedAt,
    performer: [reference("Practitioner", input.scopeAssignment.assignedBy.id)],
    valueString: input.scopeAssignment.scopeSerial,
    component: components,
  };
}

export function parseScopeVerificationObservation(obs: Observation): ScopeAssignmentRecord {
  let scopeSerial = obs.valueString ?? "";
  let scopeModel: string | undefined;
  let reprocessedAt = "";
  let leakTestResult: "PASS" | "FAIL" = "PASS";
  let cycleOutcome: "PASS" | "FAIL" = "PASS";
  let hangTimeHours = 0;
  let withinHangTimeWindow = true;
  let assignedBy: StaffRef = { id: obs.performer?.[0]?.reference?.replace(/^Practitioner\//, "") ?? "unknown", name: "Staff", initials: "ST" };

  for (const comp of obs.component ?? []) {
    const code = comp.code?.coding?.[0]?.code;
    switch (code) {
      case "serial": if (comp.valueString) scopeSerial = comp.valueString; break;
      case "model": if (comp.valueString) scopeModel = comp.valueString; break;
      case "reprocessedAt": if (comp.valueDateTime) reprocessedAt = comp.valueDateTime; break;
      case "leakTest": leakTestResult = comp.valueString === "FAIL" ? "FAIL" : "PASS"; break;
      case "cycleOutcome": cycleOutcome = comp.valueString === "FAIL" ? "FAIL" : "PASS"; break;
      case "hangTimeHours": if (comp.valueQuantity?.value !== undefined) hangTimeHours = comp.valueQuantity.value; break;
      case "withinHangTimeWindow": if (comp.valueBoolean !== undefined) withinHangTimeWindow = comp.valueBoolean; break;
      case "assignedBy": try { assignedBy = JSON.parse(comp.valueString ?? "") as StaffRef; } catch { /* ignore */ } break;
      default: break;
    }
  }

  return {
    scopeSerial,
    ...(scopeModel !== undefined ? { scopeModel } : {}),
    reprocessedAt,
    assignedAt: obs.effectiveDateTime ?? "",
    assignedBy,
    leakTestResult,
    cycleOutcome,
    hangTimeHours,
    withinHangTimeWindow,
    fhirObservationId: obs.id,
  };
}

export interface BuildGate2OverrideObservationInput {
  readonly facilityId: string;
  readonly caseId: string;
  readonly patientId: string;
  readonly override: Gate2OverrideRecord;
  readonly id?: string;
}

/**
 * Gate 2 intra-op safety checklist override observation builder.
 */
export function buildGate2OverrideObservation(input: BuildGate2OverrideObservationInput, urls: FhirUrls = fhirUrls): Observation {
  const facility = fhirId(input.facilityId, "facility id");
  const caseId = fhirId(input.caseId, "case id");
  const patient = fhirId(input.patientId, "patient id");
  const overriddenAt = instant(input.override.overriddenAt, "overriddenAt");

  const components: ObservationComponent[] = [
    { code: { coding: [{ system: urls.codeSystem("gate2-override"), code: "actor", display: "Override Actor" }], text: "Override Actor" }, valueString: JSON.stringify({ id: input.override.actorId, name: input.override.actorName, role: input.override.actorRole }) },
    { code: { coding: [{ system: urls.codeSystem("gate2-override"), code: "reason", display: "Override Reason" }], text: "Override Reason" }, valueString: input.override.reason },
    { code: { coding: [{ system: urls.codeSystem("gate2-override"), code: "blockers", display: "Overridden Blockers" }], text: "Overridden Blockers" }, valueString: JSON.stringify(input.override.overriddenBlockers) },
  ];

  const obsId = input.id ?? input.override.fhirObservationId;

  return {
    resourceType: "Observation",
    ...(obsId !== undefined ? { id: fhirId(obsId, "observation id") } : {}),
    meta: facilityMeta(facility),
    status: "final",
    category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "procedure", display: "Procedure" }] }],
    code: { coding: [{ system: "http://loinc.org", code: LOINC_CODES.GATE2_OVERRIDE, display: "Clinical safety checklist override" }], text: "Gate 2 Intra-op Safety Override Record" },
    subject: reference("Patient", patient),
    encounter: reference("Encounter", caseId),
    effectiveDateTime: overriddenAt,
    performer: [reference("Practitioner", input.override.actorId)],
    valueString: input.override.reason,
    component: components,
  };
}

export function parseGate2OverrideObservation(obs: Observation): Gate2OverrideRecord {
  let actorId = obs.performer?.[0]?.reference?.replace(/^Practitioner\//, "") ?? "";
  let actorName = "Physician";
  let actorRole = "gi-physician";
  let reason = obs.valueString ?? "";
  let overriddenBlockers: readonly string[] = [];

  for (const comp of obs.component ?? []) {
    const code = comp.code?.coding?.[0]?.code;
    switch (code) {
      case "actor":
        try {
          const actor = JSON.parse(comp.valueString ?? "") as { id: string; name: string; role: string };
          actorId = actor.id; actorName = actor.name; actorRole = actor.role;
        } catch { /* ignore */ }
        break;
      case "reason": if (comp.valueString) reason = comp.valueString; break;
      case "blockers":
        try { overriddenBlockers = JSON.parse(comp.valueString ?? "") as readonly string[]; } catch { /* ignore */ }
        break;
      default: break;
    }
  }

  return {
    overriddenAt: obs.effectiveDateTime ?? "",
    actorId,
    actorName,
    actorRole,
    reason,
    overriddenBlockers,
    fhirObservationId: obs.id,
  };
}
