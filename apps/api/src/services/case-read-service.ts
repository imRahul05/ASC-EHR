import { forFacility } from "@asc/api-client/server";
import { transitionGate } from "@asc/clinical-rules/gates";
import {
  casePhaseExtension,
  caseStageExtension,
  ENCOUNTER_STATUS_BY_PHASE,
  ENCOUNTER_STATUS_BY_STAGE,
  fhirUrls,
} from "@asc/fhir";
import type {
  CaseDetail,
  CaseSummaryFlags,
  RuleReason,
  TimeOutRecord,
} from "@asc/types";
import type { TransitionCaseInput } from "@asc/validation";
import type { MedplumClient } from "@medplum/core";
import type { Encounter, Extension } from "@medplum/fhirtypes";
import type { FastifyBaseLogger } from "fastify";
import {
  buildPatientFromFhir,
  buildProcedureCaseFromFhir,
  resolveTransitionTarget,
} from "./case-mapper.js";

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

  const [patient, appt, serviceRequests] = await Promise.all([
    medplum.readResource("Patient", patientId).catch(() => null),
    apptId ? medplum.readResource("Appointment", apptId).catch(() => null) : null,
    medplum.searchResources("ServiceRequest", [
      ["encounter", `Encounter/${caseId}`],
      ["_count", "1"],
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

  const timeOut: TimeOutRecord = {
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

  const summary: CaseSummaryFlags = {
    noteStatus: "none",
    codingStatus: "not_ready",
    specimensPending: 0,
    surveillanceSet: false,
    lettersSent: 0,
  };

  return {
    case: procedureCase,
    patient: patientObj,
    hp: null,
    consents: [],
    vitals: [],
    timeOut,
    events: [],
    narration: [],
    specimens: [],
    images: [],
    anesthesia: {
      caseId,
      provider: procedureCase.team.anesthesia,
      technique: "MAC",
      airway: { device: "nasal_cannula", o2Lpm: 2 },
      airwayEvents: [],
      doses: [],
      vitals: [],
    },
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
