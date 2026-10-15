import { forFacility } from "@asc/api-client/server";
import {
  evaluateAnticoagulationHold,
  type AnticoagulationEvaluationResult,
} from "@asc/clinical-rules";
import {
  buildAnticoagulationObservation,
  caseReadinessExtension,
  createExtensionUrls,
  fhirUrls,
} from "@asc/fhir";
import type { Medication, OverallReadiness, ReadinessCheck, ReadinessFlags } from "@asc/types";
import type { AnticoagulationAssessmentInput } from "@asc/validation";
import type { MedplumClient } from "@medplum/core";
import type { Encounter, Extension, Observation } from "@medplum/fhirtypes";
import type { FastifyBaseLogger } from "fastify";

import { getCaseDetail } from "./case-read-service.js";

type SubmitAnticoagulationResult =
  | {
      readonly status: 200;
      readonly ok: true;
      readonly evaluation: AnticoagulationEvaluationResult;
      readonly observationId?: string;
      readonly readiness?: ReadinessFlags;
      readonly readinessChecks?: readonly ReadinessCheck[];
      readonly overallReadiness?: OverallReadiness;
    }
  | {
      readonly status: 404;
      readonly code: "not_found";
      readonly message: string;
    };

export async function submitAnticoagulationAssessment(params: {
  medplum: MedplumClient;
  facilityId: string;
  caseId: string;
  input: AnticoagulationAssessmentInput;
  logger: FastifyBaseLogger;
  assessorId?: string;
  assessorName?: string;
}): Promise<SubmitAnticoagulationResult> {
  const { medplum, facilityId, caseId, input, logger, assessorId, assessorName } = params;
  const facilityAccountRef = `Organization/${facilityId}`;

  let encounter: Encounter | null;
  try {
    encounter = await medplum.readResource("Encounter", caseId);
  } catch {
    const found = await medplum.searchResources("Encounter", [
      ["_id", caseId],
      ["_count", "1"],
    ]).catch(() => []);
    encounter = found[0] ?? null;
  }

  if (!encounter) {
    return {
      status: 404,
      code: "not_found",
      message: `Case ${caseId} not found`,
    };
  }

  const isAuthorized =
    encounter.meta?.accounts?.some((a) => a.reference === facilityAccountRef) ||
    encounter.serviceProvider?.reference === facilityAccountRef;

  if (!isAuthorized) {
    return {
      status: 404,
      code: "not_found",
      message: `Case ${caseId} not found`,
    };
  }

  const patientId = encounter.subject?.reference?.replace("Patient/", "");
  if (!patientId) {
    return {
      status: 404,
      code: "not_found",
      message: `Patient reference missing on case ${caseId}`,
    };
  }

  // 1. Evaluate Anticoagulation hold rules
  const meds: Medication[] = input.hasAnticoagulants
    ? input.medications.map((m) => ({
        id: m.medicationId,
        name: m.medicationName,
        dose: "",
        frequency: "",
        medClass:
          m.drugClass === "doac" || m.drugClass === "warfarin" || m.drugClass === "lmwh"
            ? ("anticoagulant" as const)
            : m.drugClass === "p2y12" || m.drugClass === "aspirin"
              ? ("antiplatelet" as const)
              : ("other" as const),
        holdRule: null,
        holdStatus:
          m.patientConfirmedHeld === true
            ? ("confirmed" as const)
            : m.patientConfirmedHeld === false
              ? ("not_held" as const)
              : ("pending" as const),
        lastTakenAt: m.lastDoseTakenAt ?? undefined,
      }))
    : [];

  const evaluation = evaluateAnticoagulationHold({
    medications: meds,
    procedureBleedingRisk: input.procedureBleedingRisk,
    assessments: input.hasAnticoagulants ? input.medications : [],
  });

  const facilityClient = forFacility(medplum, facilityId);

  // 2. Build and persist Observation
  const obs = buildAnticoagulationObservation({
    facilityId,
    caseId,
    patientId,
    procedureBleedingRisk: input.procedureBleedingRisk,
    hasAnticoagulants: input.hasAnticoagulants,
    status: evaluation.status,
    recommendations: evaluation.recommendations.map((rec) => {
      const medItem = input.medications.find((m) => m.medicationId === rec.medicationId);
      return {
        medicationId: rec.medicationId,
        medicationName: rec.medicationName,
        drugClass: rec.drugClass,
        recommendedHoldHours: rec.recommendedHoldHours,
        recommendationText: rec.recommendationText,
        prescriberInstructionDate: medItem?.prescriberInstructionDate,
        prescriberInstruction: medItem?.prescriberInstruction,
        patientConfirmedHeld: medItem?.patientConfirmedHeld,
      };
    }),
    assessedAt: input.assessedAt,
    practitionerId: input.assessorId ?? assessorId,
  });

  const createdObs = await facilityClient.create<Observation>(obs);

  // 3. Update Encounter readiness check 'anticoagulation'
  const existingExtensions = encounter.extension ?? [];
  const readinessTargetUrl = createExtensionUrls(fhirUrls).caseReadiness;

  const filteredExtensions = existingExtensions.filter((e: Extension) => {
    if (e.url === readinessTargetUrl) {
      const nameSub = e.extension?.find((sub) => sub.url === "name");
      if (nameSub?.valueCode === "anticoagulation") {
        return false;
      }
    }
    return true;
  });

  const updatedExtensions: Extension[] = [
    ...filteredExtensions,
    caseReadinessExtension({
      name: "anticoagulation",
      status: evaluation.status,
      label: "Anticoagulation hold",
      details: evaluation.message,
    }),
  ];

  const updatedEncounter: Encounter = {
    ...encounter,
    extension: updatedExtensions,
  };

  await facilityClient.update(updatedEncounter);

  logger.info(
    { caseId, status: evaluation.status, observationId: createdObs.id, assessorName },
    "anticoagulation assessment recorded and readiness updated",
  );

  const updatedDetail = await getCaseDetail({ medplum, facilityId, caseId });

  return {
    status: 200,
    ok: true,
    evaluation,
    observationId: createdObs.id,
    readiness: updatedDetail?.case.readiness,
    readinessChecks: updatedDetail?.case.readinessChecks,
    overallReadiness: updatedDetail?.case.overallReadiness,
  };
}
