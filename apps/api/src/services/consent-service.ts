import { forFacility } from "@asc/api-client/server";
import {
  buildConsentResource,
  caseReadinessExtension,
  createExtensionUrls,
  fhirUrls,
} from "@asc/fhir";
import type {
  Consent,
  OverallReadiness,
  ReadinessCheck,
  ReadinessFlags,
} from "@asc/types";
import type { SignConsentInput } from "@asc/validation";
import type { MedplumClient } from "@medplum/core";
import type { Consent as FhirConsent, Encounter, Extension } from "@medplum/fhirtypes";
import type { FastifyBaseLogger } from "fastify";

import { getCaseDetail } from "./case-read-service.js";

type SignConsentResult =
  | {
      readonly status: 200;
      readonly ok: true;
      readonly consent: Consent;
      readonly readiness?: ReadinessFlags;
      readonly readinessChecks?: readonly ReadinessCheck[];
      readonly overallReadiness?: OverallReadiness;
    }
  | {
      readonly status: 404;
      readonly code: "not_found";
      readonly message: string;
    };

export async function signConsent(params: {
  medplum: MedplumClient;
  facilityId: string;
  caseId: string;
  input: SignConsentInput;
  logger: FastifyBaseLogger;
}): Promise<SignConsentResult> {
  const { medplum, facilityId, caseId, input, logger } = params;
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

  // Procedure match check per AC-E-09-2
  const serviceRequests = await medplum.searchResources("ServiceRequest", [
    ["encounter", `Encounter/${caseId}`],
    ["_count", "1"],
  ]).catch(() => []);
  const scheduledSr = serviceRequests[0];
  const scheduledCode = scheduledSr?.code?.coding?.[0]?.code ?? encounter.serviceType?.coding?.[0]?.code;
  const scheduledDisplay =
    scheduledSr?.code?.coding?.[0]?.display ??
    scheduledSr?.code?.text ??
    encounter.serviceType?.text;

  const isMismatch = Boolean(
    scheduledCode && input.procedureCode && scheduledCode.trim() !== input.procedureCode.trim(),
  );

  const consentStatus = isMismatch ? "failed" : "satisfied";
  const consentDetails = isMismatch
    ? `Procedure mismatch: signed for ${input.procedureName} (${input.procedureCode}), scheduled for ${scheduledDisplay ?? scheduledCode}`
    : `Signed by ${input.signerName} (${input.signerRelationship})`;

  // Build and store FHIR Consent resource
  const consentFhir = buildConsentResource({
    facilityId,
    patientId,
    caseId,
    procedureName: input.procedureName,
    procedureCode: input.procedureCode,
    performingPhysicianName: input.performingPhysicianName,
    signerName: input.signerName,
    signerRelationship: input.signerRelationship,
    signatureDataUrl: input.signatureDataUrl,
    consentFormVersion: input.consentFormVersion,
    dateTime: new Date().toISOString(),
  });

  const createdConsent = await forFacility(medplum, facilityId).create(consentFhir);

  // Update Encounter readiness check
  const existingExtensions = encounter.extension ?? [];
  const readinessTargetUrl = createExtensionUrls(fhirUrls).caseReadiness;

  // Filter out any existing 'consent' check from extensions
  const filteredExtensions = existingExtensions.filter((e: Extension) => {
    if (e.url !== readinessTargetUrl) return true;
    const nameSub = e.extension?.find((sub) => sub.url === "name");
    return nameSub?.valueCode !== "consent";
  });

  const updatedConsentCheck: ReadinessCheck = {
    name: "consent",
    status: consentStatus,
    label: "Informed consent",
    details: consentDetails,
  };

  const updatedExtensions: Extension[] = [
    ...filteredExtensions,
    caseReadinessExtension(updatedConsentCheck),
  ];

  const updatedEncounter: Encounter = {
    ...encounter,
    extension: updatedExtensions,
  };

  await forFacility(medplum, facilityId).update(updatedEncounter);

  logger.info(
    { caseId, consentId: createdConsent.id, signerRelationship: input.signerRelationship, consentStatus },
    "informed consent signed and case readiness updated",
  );

  const updatedDetail = await getCaseDetail({ medplum, facilityId, caseId });

  const mappedConsent: Consent = {
    id: createdConsent.id ?? `consent-${caseId}`,
    caseId,
    kind: "procedure",
    title: input.procedureName,
    summary: `Informed consent for ${input.procedureName} performed by ${input.performingPhysicianName}`,
    status: "signed",
    signerName: input.signerName,
    signedAt: createdConsent.dateTime ?? new Date().toISOString(),
    signatureDataUrl: input.signatureDataUrl,
  };

  return {
    status: 200,
    ok: true,
    consent: mappedConsent,
    readiness: updatedDetail?.case.readiness,
    readinessChecks: updatedDetail?.case.readinessChecks,
    overallReadiness: updatedDetail?.case.overallReadiness,
  };
}

export async function getConsent(params: {
  medplum: MedplumClient;
  facilityId: string;
  caseId: string;
}): Promise<Consent | null> {
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

  if (!encounter) return null;

  const isAuthorized =
    encounter.meta?.accounts?.some((a) => a.reference === facilityAccountRef) ||
    encounter.serviceProvider?.reference === facilityAccountRef;
  if (!isAuthorized) return null;

  const patientId = encounter.subject?.reference?.replace("Patient/", "");
  if (!patientId) return null;

  const consents: FhirConsent[] = await medplum.searchResources("Consent", [
    ["patient", `Patient/${patientId}`],
    ["_count", "20"],
  ]).catch(() => []);

  const caseRefUrl = fhirUrls.structureDefinition("case-reference");
  const matching = consents.find((c) =>
    c.extension?.some((e) => e.url === caseRefUrl && e.valueReference?.reference === `Encounter/${caseId}`),
  );

  if (!matching) return null;

  const procNameExt = matching.extension?.find((e) => e.url === fhirUrls.structureDefinition("procedure-name"));
  const physicianExt = matching.extension?.find((e) => e.url === fhirUrls.structureDefinition("performing-physician"));
  const procName = procNameExt?.valueString ?? "Procedure";

  return {
    id: matching.id ?? `consent-${caseId}`,
    caseId,
    kind: "procedure",
    title: procName,
    summary: `Informed consent for ${procName} performed by ${physicianExt?.valueString ?? "Physician"}`,
    status: "signed",
    signerName: matching.performer?.[0]?.display,
    signedAt: matching.dateTime,
  };
}
