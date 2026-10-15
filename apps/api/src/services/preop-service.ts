import { forFacility } from "@asc/api-client/server";
import {
  buildPreopObservations,
  caseReadinessExtension,
  createExtensionUrls,
  fhirUrls,
} from "@asc/fhir";
import type {
  OverallReadiness,
  ReadinessCheck,
  ReadinessFlags,
  VitalsEntry,
} from "@asc/types";
import type { PreopAssessmentInput } from "@asc/validation";
import type { MedplumClient } from "@medplum/core";
import type { Encounter, Extension } from "@medplum/fhirtypes";
import type { FastifyBaseLogger } from "fastify";

import { getCaseDetail } from "./case-read-service.js";

type SubmitPreopResult =
  | {
      readonly status: 200;
      readonly ok: true;
      readonly vitals: VitalsEntry;
      readonly readiness?: ReadinessFlags;
      readonly readinessChecks?: readonly ReadinessCheck[];
      readonly overallReadiness?: OverallReadiness;
    }
  | {
      readonly status: 404;
      readonly code: "not_found";
      readonly message: string;
    };

export async function submitPreopAssessment(params: {
  medplum: MedplumClient;
  facilityId: string;
  caseId: string;
  input: PreopAssessmentInput;
  logger: FastifyBaseLogger;
  performerId?: string;
  performerName?: string;
}): Promise<SubmitPreopResult> {
  const { medplum, facilityId, caseId, input, logger, performerId, performerName } = params;
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

  const nowIso = new Date().toISOString();

  // 1. Create discrete LOINC Observations
  const observations = buildPreopObservations({
    facilityId,
    patientId,
    caseId,
    recordedAt: nowIso,
    performerId,
    vitals: input.vitals,
  });

  const facilityClient = forFacility(medplum, facilityId);
  for (const obs of observations) {
    await facilityClient.create(obs);
  }

  // 2. Evaluate NPO (Solid food >= 6h, clear liquids >= 2h, and confirmed)
  const npoPassed =
    input.npo.solidFoodHoursAgo >= 6 &&
    input.npo.clearLiquidsHoursAgo >= 2 &&
    input.npo.confirmed;

  const prepCheckStatus = npoPassed ? "satisfied" : "failed";
  const prepDetails = npoPassed
    ? `NPO confirmed: solids ${input.npo.solidFoodHoursAgo}h ago, clear liquids ${input.npo.clearLiquidsHoursAgo}h ago`
    : `NPO violation: solids ${input.npo.solidFoodHoursAgo}h (< 6h) or clear liquids ${input.npo.clearLiquidsHoursAgo}h (< 2h)`;

  // 3. Evaluate Escort
  const escortCheckStatus = input.escort.confirmedPresent ? "satisfied" : "pending";
  const escortDetails = input.escort.confirmedPresent
    ? `Escort confirmed: ${input.escort.name} (${input.escort.phone})`
    : `Escort unconfirmed: ${input.escort.name} (${input.escort.phone})`;

  // 4. Update Encounter with IV placement and readiness checks
  const existingExtensions = encounter.extension ?? [];
  const readinessTargetUrl = createExtensionUrls(fhirUrls).caseReadiness;
  const ivUrl = fhirUrls.structureDefinition("preop-iv-placement");

  // Filter out existing prep, escort, and iv extensions
  const filteredExtensions = existingExtensions.filter((e: Extension) => {
    if (e.url === ivUrl) return false;
    if (e.url === readinessTargetUrl) {
      const nameSub = e.extension?.find((sub) => sub.url === "name");
      if (nameSub?.valueCode === "prep" || nameSub?.valueCode === "escort") {
        return false;
      }
    }
    return true;
  });

  const updatedExtensions: Extension[] = [
    ...filteredExtensions,
    caseReadinessExtension({
      name: "prep",
      status: prepCheckStatus,
      label: "Bowel preparation",
      details: prepDetails,
    }),
    caseReadinessExtension({
      name: "escort",
      status: escortCheckStatus,
      label: "Responsible escort",
      details: escortDetails,
    }),
    {
      url: ivUrl,
      extension: [
        { url: "site", valueCode: input.iv.site },
        { url: "gauge", valueInteger: input.iv.gauge },
        { url: "attempts", valueInteger: input.iv.attempts },
      ],
    },
  ];

  const updatedEncounter: Encounter = {
    ...encounter,
    extension: updatedExtensions,
  };

  await facilityClient.update(updatedEncounter);

  logger.info(
    { caseId, npoPassed, escortConfirmed: input.escort.confirmedPresent },
    "pre-op nursing assessment saved and readiness updated",
  );

  const updatedDetail = await getCaseDetail({ medplum, facilityId, caseId });

  const vitalsEntry: VitalsEntry = {
    id: `vitals-${caseId}-preop`,
    caseId,
    context: "pre_op",
    recordedAt: nowIso,
    sbp: input.vitals.sbp,
    dbp: input.vitals.dbp,
    hr: input.vitals.hr,
    rr: input.vitals.rr,
    spo2: input.vitals.spo2,
    tempC: input.vitals.tempC,
    recordedBy: {
      id: performerId ?? "staff-rn",
      name: performerName ?? "Pre-Op Nurse",
      initials: "RN",
    },
  };

  return {
    status: 200,
    ok: true,
    vitals: vitalsEntry,
    readiness: updatedDetail?.case.readiness,
    readinessChecks: updatedDetail?.case.readinessChecks,
    overallReadiness: updatedDetail?.case.overallReadiness,
  };
}
