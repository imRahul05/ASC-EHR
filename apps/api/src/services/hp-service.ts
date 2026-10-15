import { forFacility } from "@asc/api-client/server";
import { PERMITTED_HP_OVERRIDE_ROLES, evaluateHpValidity } from "@asc/clinical-rules";
import {
  buildHpUpdateDocumentReference,
  caseReadinessExtension,
  createExtensionUrls,
  fhirUrls,
  readCaseReadiness,
} from "@asc/fhir";
import type { HpDetailResponse, OverallReadiness, ReadinessCheck, ReadinessFlags } from "@asc/types";
import type { HpOverrideInput, HpUpdateNoteInput } from "@asc/validation";
import type { MedplumClient } from "@medplum/core";
import type { DocumentReference, Encounter, Extension } from "@medplum/fhirtypes";
import type { FastifyBaseLogger } from "fastify";

import { getCaseDetail } from "./case-read-service.js";

type SubmitHpUpdateResult =
  | {
      readonly status: 200;
      readonly ok: true;
      readonly documentId?: string;
      readonly readiness?: ReadinessFlags;
      readonly readinessChecks?: readonly ReadinessCheck[];
      readonly overallReadiness?: OverallReadiness;
    }
  | {
      readonly status: 404;
      readonly code: "not_found";
      readonly message: string;
    };

type SubmitHpOverrideResult =
  | {
      readonly status: 200;
      readonly ok: true;
      readonly readiness?: ReadinessFlags;
      readonly readinessChecks?: readonly ReadinessCheck[];
      readonly overallReadiness?: OverallReadiness;
    }
  | {
      readonly status: 403;
      readonly code: "forbidden";
      readonly message: string;
    }
  | {
      readonly status: 404;
      readonly code: "not_found";
      readonly message: string;
    };

type GetHpDetailResult =
  | {
      readonly status: 200;
      readonly data: HpDetailResponse;
    }
  | {
      readonly status: 404;
      readonly code: "not_found";
      readonly message: string;
    };

export async function submitHpUpdateNote(params: {
  medplum: MedplumClient;
  facilityId: string;
  caseId: string;
  input: HpUpdateNoteInput;
  logger: FastifyBaseLogger;
  practitionerId?: string;
  practitionerName?: string;
}): Promise<SubmitHpUpdateResult> {
  const { medplum, facilityId, caseId, input, logger, practitionerId, practitionerName } = params;
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

  const facilityClient = forFacility(medplum, facilityId);
  const effectivePractitionerName = input.practitionerName ?? practitionerName ?? "Attending Physician";
  const signedAt = input.signedAt ?? new Date().toISOString();

  // 1. Build and persist DocumentReference
  const docRef = buildHpUpdateDocumentReference({
    facilityId,
    caseId,
    patientId,
    practitionerId: input.practitionerId ?? practitionerId,
    practitionerName: effectivePractitionerName,
    attestation: input.attestation,
    cardiovascularStatus: input.cardiovascularStatus,
    pulmonaryStatus: input.pulmonaryStatus,
    airwayStatus: input.airwayStatus,
    signedAt,
  });

  const createdDoc = await facilityClient.create<DocumentReference>(docRef);

  // 2. Update Encounter readiness check 'hp' to 'satisfied'
  const existingExtensions = encounter.extension ?? [];
  const readinessTargetUrl = createExtensionUrls(fhirUrls).caseReadiness;

  const filteredExtensions = existingExtensions.filter((e: Extension) => {
    if (e.url === readinessTargetUrl) {
      const nameSub = e.extension?.find((sub) => sub.url === "name");
      if (nameSub?.valueCode === "hp") {
        return false;
      }
    }
    return true;
  });

  const updatedExtensions: Extension[] = [
    ...filteredExtensions,
    caseReadinessExtension({
      name: "hp",
      status: "satisfied",
      label: "History & physical",
      details: `Day-of interval update signed by ${effectivePractitionerName}: No interval change in cardiovascular, pulmonary, or airway status`,
    }),
  ];

  const updatedEncounter: Encounter = {
    ...encounter,
    extension: updatedExtensions,
  };

  await facilityClient.update(updatedEncounter);

  logger.info({ caseId, documentId: createdDoc.id }, "day-of H&P update note recorded and hp readiness satisfied");

  const updatedDetail = await getCaseDetail({ medplum, facilityId, caseId });

  return {
    status: 200,
    ok: true,
    documentId: createdDoc.id,
    readiness: updatedDetail?.case.readiness,
    readinessChecks: updatedDetail?.case.readinessChecks,
    overallReadiness: updatedDetail?.case.overallReadiness,
  };
}

export async function submitHpOverride(params: {
  medplum: MedplumClient;
  facilityId: string;
  caseId: string;
  input: HpOverrideInput;
  logger: FastifyBaseLogger;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
}): Promise<SubmitHpOverrideResult> {
  const { medplum, facilityId, caseId, input, logger, actorId, actorRole } = params;

  // Role validation: actorRole and input.role must be an allowed role
  if (!PERMITTED_HP_OVERRIDE_ROLES.includes(input.role)) {
    return {
      status: 403,
      code: "forbidden",
      message: "H&P override requires attending physician or medical director role",
    };
  }

  if (actorRole && !PERMITTED_HP_OVERRIDE_ROLES.includes(actorRole)) {
    return {
      status: 403,
      code: "forbidden",
      message: "H&P override requires attending physician or medical director role",
    };
  }

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

  const facilityClient = forFacility(medplum, facilityId);
  const waivedBy = input.practitionerId ?? actorId ?? "practitioner";
  const waivedAt = input.overriddenAt ?? new Date().toISOString();

  // Update Encounter readiness check 'hp' to 'waived'
  const existingExtensions = encounter.extension ?? [];
  const readinessTargetUrl = createExtensionUrls(fhirUrls).caseReadiness;

  const filteredExtensions = existingExtensions.filter((e: Extension) => {
    if (e.url === readinessTargetUrl) {
      const nameSub = e.extension?.find((sub) => sub.url === "name");
      if (nameSub?.valueCode === "hp") {
        return false;
      }
    }
    return true;
  });

  const updatedExtensions: Extension[] = [
    ...filteredExtensions,
    caseReadinessExtension({
      name: "hp",
      status: "waived",
      label: "History & physical",
      details: `Clinical override (${input.role}): ${input.overrideReason}`,
      waivedBy,
      waivedRole: input.role,
      waivedAt,
      waiverReason: input.overrideReason,
    }),
  ];

  const updatedEncounter: Encounter = {
    ...encounter,
    extension: updatedExtensions,
  };

  await facilityClient.update(updatedEncounter);

  logger.info({ caseId, role: input.role, reason: input.overrideReason }, "H&P readiness check waived by physician override");

  const updatedDetail = await getCaseDetail({ medplum, facilityId, caseId });

  return {
    status: 200,
    ok: true,
    readiness: updatedDetail?.case.readiness,
    readinessChecks: updatedDetail?.case.readinessChecks,
    overallReadiness: updatedDetail?.case.overallReadiness,
  };
}

export async function getHpDetail(params: {
  medplum: MedplumClient;
  facilityId: string;
  caseId: string;
}): Promise<GetHpDetailResult> {
  const { medplum, facilityId, caseId } = params;
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

  const readinessChecks = readCaseReadiness(encounter.extension);
  const hpCheck = readinessChecks.find((c) => c.name === "hp");
  const procedureDate = encounter.period?.start ?? new Date().toISOString();

  // Search for day-of update note DocumentReference
  const docs = await medplum.searchResources("DocumentReference", [
    ["encounter", `Encounter/${caseId}`],
    ["type", "11506-3"],
  ]).catch(() => []);
  const updateDoc = docs[0];

  const validity = evaluateHpValidity({
    documentedDate: procedureDate,
    updateNoteSignedDate: updateDoc?.date,
    procedureDate,
  });

  const response: HpDetailResponse = {
    caseId,
    status: hpCheck?.status ?? "pending",
    validity,
    documentedDate: procedureDate,
    updateNote: updateDoc
      ? {
          id: updateDoc.id,
          signedAt: updateDoc.date,
          practitionerName: updateDoc.author?.[0]?.display,
          attestation: updateDoc.description,
        }
      : null,
    override:
      hpCheck?.status === "waived"
        ? {
            waivedBy: hpCheck.waivedBy,
            waivedRole: hpCheck.waivedRole,
            waivedAt: hpCheck.waivedAt,
            waiverReason: hpCheck.waiverReason,
          }
        : null,
  };

  return {
    status: 200,
    data: response,
  };
}
