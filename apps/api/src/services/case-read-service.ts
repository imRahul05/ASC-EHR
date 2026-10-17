import { forFacility } from "@asc/api-client/server";
import { transitionGate } from "@asc/clinical-rules/gates";
import {
  casePhaseExtension,
  caseStageExtension,
  ENCOUNTER_STATUS_BY_PHASE,
  ENCOUNTER_STATUS_BY_STAGE,
  fhirUrls,
  LOINC_CODES,
  parseGate2OverrideObservation,
  parseProcedureEventObservation,
  parseScopeVerificationObservation,
  parseSurgicalTimeOutObservation,
} from "@asc/fhir";
import type {
  CaseDetail,
  CaseSummaryFlags,
  Gate2OverrideRecord,
  ProcedureCase,
  ProcedureEvent,
  RuleReason,
  ScopeAssignmentRecord,
  TimeOutRecord,
} from "@asc/types";
import type { TransitionCaseInput } from "@asc/validation";
import type { MedplumClient } from "@medplum/core";
import type { Encounter, Extension, Observation } from "@medplum/fhirtypes";
import type { FastifyBaseLogger } from "fastify";
import {
  buildPatientFromFhir,
  buildProcedureCaseFromFhir,
  resolveTransitionTarget,
} from "./case-mapper.js";
import { hydrateAnesthesiaRecord } from "./case-hydrators/anesthesia.js";

export async function getCaseDetail(params: {
  medplum: MedplumClient;
  facilityId: string;
  caseId: string;
}): Promise<CaseDetail | null> {
  const { medplum, facilityId, caseId } = params;
  const facilityAccountRef = `Organization/${facilityId}`;

  let encounter: Encounter | null;
  try {
    encounter = await medplum.readResource("Encounter", caseId);
  } catch {
    const foundEncounters = await medplum.searchResources("Encounter", [
      ["_id", caseId],
      ["_count", "1"],
    ]).catch(() => []);
    encounter = foundEncounters[0] ?? null;
  }

  if (!encounter) {
    return null;
  }

  const isAuthorizedFacility =
    encounter.meta?.accounts?.some((a) => a.reference === facilityAccountRef) ||
    encounter.serviceProvider?.reference === facilityAccountRef;

  if (!isAuthorizedFacility) {
    return null;
  }

  const patientId = encounter.subject?.reference?.replace("Patient/", "");
  if (!patientId) {
    return null;
  }

  const apptId = encounter.appointment?.[0]?.reference?.replace("Appointment/", "");

  const [patient, appt, serviceRequests, observations, medAdmins] = await Promise.all([
    medplum.readResource("Patient", patientId).catch(() => null),
    apptId ? medplum.readResource("Appointment", apptId).catch(() => null) : null,
    medplum.searchResources("ServiceRequest", [
      ["encounter", `Encounter/${caseId}`],
      ["_count", "1"],
    ]).catch(() => []),
    medplum.searchResources("Observation", [
      ["encounter", `Encounter/${caseId}`],
      ["_count", "100"],
    ]).catch(() => []),
    medplum.searchResources("MedicationAdministration", [
      ["context", `Encounter/${caseId}`],
      ["_count", "100"],
    ]).catch(() => []),
  ]);

  if (!patient) {
    return null;
  }

  const procedureCase = buildProcedureCaseFromFhir({
    appItem: appt ?? undefined,
    encounter,
    fhirPatient: patient,
    serviceRequest: serviceRequests[0],
  });

  const patientObj = buildPatientFromFhir(patient);

  let timeOut: TimeOutRecord = {
    caseId,
    checklist: {
      patientIdentity: false,
      procedureConfirmed: false,
      consentVerified: false,
      allergiesReviewed: false,
      equipmentReady: false,
      anticoagulationReviewed: false,
    },
    attestations: [],
  };

  const events: ProcedureEvent[] = [];
  let scopeAssignment: ScopeAssignmentRecord | undefined;
  let gate2Override: Gate2OverrideRecord | undefined;

  // Sort observations deterministically by effectiveDateTime descending (most recent first)
  const sortedObs = [...observations].sort((a, b) => {
    const timeA = Date.parse(a.effectiveDateTime ?? a.meta?.lastUpdated ?? "");
    const timeB = Date.parse(b.effectiveDateTime ?? b.meta?.lastUpdated ?? "");
    const valA = Number.isNaN(timeA) ? 0 : timeA;
    const valB = Number.isNaN(timeB) ? 0 : timeB;
    return valB - valA;
  });

  const timeoutObservations: Observation[] = [];

  for (const obs of sortedObs) {
    const code = obs.code?.coding?.[0]?.code;
    if (code === LOINC_CODES.SURGICAL_TIMEOUT) {
      timeoutObservations.push(obs);
    } else if (code === LOINC_CODES.INTRAOP_EVENT) {
      events.push(parseProcedureEventObservation(obs));
    } else if (code === LOINC_CODES.SCOPE_VERIFICATION && !scopeAssignment) {
      scopeAssignment = parseScopeVerificationObservation(obs);
    } else if (code === LOINC_CODES.GATE2_OVERRIDE && !gate2Override) {
      gate2Override = parseGate2OverrideObservation(obs);
    }
  }

  if (timeoutObservations.length > 0) {
    timeOut = parseSurgicalTimeOutObservation(timeoutObservations[0]!);
    if (timeoutObservations.length > 1) {
      const mergedParticipants = [...(timeOut.participants ?? [])];
      for (let i = 1; i < timeoutObservations.length; i++) {
        const extra = parseSurgicalTimeOutObservation(timeoutObservations[i]!);
        for (const p of extra.participants ?? []) {
          if (!mergedParticipants.some((existing) => existing.userId === p.userId)) {
            mergedParticipants.push(p);
          }
        }
      }
      timeOut = {
        ...timeOut,
        participants: mergedParticipants,
      };
    }
  }

  events.sort((a, b) => a.at.localeCompare(b.at));

  const isTimeOutComplete = Boolean(
    timeOut.completedAt ||
      (timeOut.participants && timeOut.participants.length >= 2) ||
      (timeOut.checklist.patientIdentity &&
        timeOut.checklist.procedureConfirmed &&
        timeOut.checklist.consentVerified &&
        timeOut.checklist.allergiesReviewed &&
        timeOut.checklist.equipmentReady &&
        timeOut.checklist.anticoagulationReviewed),
  );

  const updatedReadiness = {
    ...procedureCase.readiness,
    timeOutComplete: isTimeOutComplete,
  };

  const updatedCase: ProcedureCase = {
    ...procedureCase,
    readiness: updatedReadiness,
  };

  const summary: CaseSummaryFlags = {
    noteStatus: "none",
    codingStatus: "not_ready",
    specimensPending: 0,
    surveillanceSet: false,
    lettersSent: 0,
  };

  const anesthesia = await hydrateAnesthesiaRecord({
    caseId,
    provider: procedureCase.team.anesthesia,
    medplum,
    observations,
    medAdmins,
    events,
  });

  return {
    case: updatedCase,
    patient: patientObj,
    hp: null,
    consents: [],
    vitals: [],
    timeOut,
    events,
    ...(scopeAssignment !== undefined ? { scopeAssignment } : {}),
    ...(gate2Override !== undefined ? { gate2Override } : {}),
    narration: [],
    specimens: [],
    images: [],
    anesthesia,
    aldrete: null,
    discharge: null,
    summary,
  };
}

type TransitionResult =
  | { readonly status: 200; readonly data: CaseDetail }
  | { readonly status: 404; readonly code: "not_found"; readonly message: string }
  | { readonly status: 409; readonly code: "GATE_FAILED"; readonly message: string; readonly reasons: readonly RuleReason[] };

export async function transitionCase(params: {
  medplum: MedplumClient;
  facilityId: string;
  caseId: string;
  input: TransitionCaseInput;
  logger: FastifyBaseLogger;
}): Promise<TransitionResult> {
  const { medplum, facilityId, caseId, input, logger } = params;

  const currentDetail = await getCaseDetail({ medplum, facilityId, caseId });
  if (!currentDetail) {
    return {
      status: 404,
      code: "not_found",
      message: `Case ${caseId} not found`,
    };
  }

  const { canonicalTarget, matchedStage, matchedPhase } = resolveTransitionTarget(input.to);
  const gateResult = transitionGate(currentDetail, canonicalTarget);

  if (!gateResult.ok) {
    logger.warn(
      { caseId, target: canonicalTarget, reasonCodes: gateResult.reasons.map((r) => r.code) },
      "transition rejected by clinical gate",
    );
    return {
      status: 409,
      code: "GATE_FAILED",
      message: gateResult.reasons[0]?.message ?? "Clinical gate rejected transition",
      reasons: gateResult.reasons,
    };
  }

  let rawEncounter: Encounter | null;
  const facilityAccountRef = `Organization/${facilityId}`;
  try {
    rawEncounter = await medplum.readResource("Encounter", caseId);
  } catch {
    const foundEncounters = await medplum.searchResources("Encounter", [
      ["_id", caseId],
      ["_count", "1"],
    ]).catch(() => []);
    rawEncounter = foundEncounters[0] ?? null;
  }

  if (!rawEncounter) {
    return {
      status: 404,
      code: "not_found",
      message: `Case ${caseId} not found`,
    };
  }

  const hasFacilityAccount =
    rawEncounter.meta?.accounts?.some((acc) => acc.reference === facilityAccountRef) ||
    rawEncounter.serviceProvider?.reference === facilityAccountRef;
  if (!hasFacilityAccount) {
    return {
      status: 404,
      code: "not_found",
      message: `Case ${caseId} not found`,
    };
  }

  let newStatus = rawEncounter.status;
  if (matchedStage !== undefined) {
    newStatus = ENCOUNTER_STATUS_BY_STAGE[matchedStage];
  } else if (matchedPhase !== undefined) {
    newStatus = ENCOUNTER_STATUS_BY_PHASE[matchedPhase];
  }

  const currentExtensions = rawEncounter.extension ?? [];
  const urls = fhirUrls;
  const stageUrl = urls.structureDefinition("case-stage");
  const phaseUrl = urls.structureDefinition("case-phase");
  const timestampsUrl = urls.structureDefinition("case-stage-timestamps");

  const filteredExtensions = currentExtensions.filter(
    (e: Extension) => e.url !== stageUrl && e.url !== phaseUrl && e.url !== timestampsUrl,
  );

  const updatedExtensions: Extension[] = [...filteredExtensions];

  if (matchedStage !== undefined) {
    updatedExtensions.push(caseStageExtension(matchedStage, urls));
  }
  if (matchedPhase !== undefined) {
    updatedExtensions.push(casePhaseExtension(matchedPhase, urls));
  }

  const existingTimestampsExt = currentExtensions.find((e: Extension) => e.url === timestampsUrl);
  const existingSubExtensions: Extension[] = existingTimestampsExt?.extension ? [...existingTimestampsExt.extension] : [];

  const nowIso = new Date().toISOString();
  const targetKey = matchedStage ?? matchedPhase ?? canonicalTarget;
  const existingSubIndex = existingSubExtensions.findIndex((sub) => sub.url === targetKey);
  if (existingSubIndex >= 0) {
    existingSubExtensions[existingSubIndex] = { url: targetKey, valueDateTime: nowIso };
  } else {
    existingSubExtensions.push({ url: targetKey, valueDateTime: nowIso });
  }

  updatedExtensions.push({
    url: timestampsUrl,
    extension: existingSubExtensions,
  });

  let updatedPeriod = rawEncounter.period;
  if (!updatedPeriod?.start && (matchedStage === "arrived" || matchedStage === "preop" || matchedStage === "in_room")) {
    updatedPeriod = { ...updatedPeriod, start: nowIso };
  } else if (matchedStage === "discharged" || newStatus === "finished") {
    updatedPeriod = { ...updatedPeriod, end: nowIso };
  }

  const updatedEncounter: Encounter = {
    ...rawEncounter,
    status: newStatus,
    period: updatedPeriod,
    extension: updatedExtensions,
  };

  await forFacility(medplum, facilityId).update(updatedEncounter);

  logger.info(
    { caseId, previousStage: currentDetail.case.stage, target: canonicalTarget, status: newStatus },
    "case transition executed successfully",
  );

  const updatedDetail = await getCaseDetail({ medplum, facilityId, caseId });
  return {
    status: 200,
    data: updatedDetail ?? currentDetail,
  };
}
