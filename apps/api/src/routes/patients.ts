import { forFacility } from "@asc/api-client/server";
import { grantedFacilityIds } from "@asc/authz";
import {
  evaluateDuplicateMatch,
  type DuplicateMatchResult,
  type ExistingPatientSummary,
} from "@asc/clinical-rules/patients/duplicate-match";
import { API_ROUTE_PATTERNS } from "@asc/config";
import {
  buildCoverage,
  buildPatient,
  buildRelatedPerson,
  createTransaction,
  fhirUrls,
} from "@asc/fhir";
import {
  formatZodError,
  patientSearchQuerySchema,
  registerPatientSchema,
  type PatientSearchQuery,
  type RegisterPatientInput,
} from "@asc/validation";
import type { FacilityRegistrationLock } from "@asc/types";
import type { WithId } from "@medplum/core";
import type { Coverage, Patient, RelatedPerson } from "@medplum/fhirtypes";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";

export function createInMemoryRegistrationLock(): FacilityRegistrationLock {
  const queues = new Map<string, Promise<void>>();
  return {
    async withLock<T>(facilityId: string, operation: () => Promise<T>): Promise<T> {
      const previous = queues.get(facilityId) ?? Promise.resolve();
      let release: () => void = () => {};
      const current = new Promise<void>((resolve) => {
        release = resolve;
      });
      queues.set(facilityId, current);

      try {
        await previous.catch(() => {});
        return await operation();
      } finally {
        release();
        if (queues.get(facilityId) === current) {
          queues.delete(facilityId);
        }
      }
    },
  };
}

declare module "fastify" {
  interface FastifyInstance {
    facilityRegistrationLock?: FacilityRegistrationLock;
  }
}

const defaultFallbackLock = createInMemoryRegistrationLock();

interface NetworkErrorLike {
  name?: string;
  message?: string;
  code?: string;
  cause?: NetworkErrorLike;
}

function isNetworkErrorLike(err: unknown): err is NetworkErrorLike {
  return typeof err === "object" && err !== null;
}

export function isAmbiguousNetworkError(err: unknown): boolean {
  if (!isNetworkErrorLike(err)) {
    return false;
  }
  const name = err.name ?? "";
  const msg = (err.message ?? "").toLowerCase();
  const code = err.code ?? "";

  if (name === "AbortError" || name === "TimeoutError") {
    return true;
  }

  const networkCodes = [
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNREFUSED",
    "EAI_AGAIN",
    "ENOTFOUND",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_SOCKET",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_BODY_TIMEOUT",
    "ERR_STREAM_PREMATURE_CLOSE",
  ];
  if (networkCodes.includes(code)) {
    return true;
  }

  if (msg.includes("fetch failed") || msg.includes("network error") || msg.includes("socket hang up")) {
    return true;
  }

  if (err.cause !== undefined) {
    return isAmbiguousNetworkError(err.cause);
  }

  return false;
}

export async function withFacilityRegistrationLock<T>(
  facilityId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return defaultFallbackLock.withLock(facilityId, operation);
}

/**
 * Idempotent recovery for patient registration.
 * When a registration matches an existing patient with the same MRN and matching demographics
 * (e.g. after a prior failure in secondary resource creation or a network retry), this safely
 * attaches any missing secondary resources (Coverage, RelatedPerson) and returns HTTP 200.
 */
async function completeOrRecoverRegistration(
  existingPatient: WithId<Patient>,
  body: RegisterPatientInput,
  facilityId: string,
  writer: ReturnType<typeof forFacility>,
  request: FastifyRequest,
  duplicateMatch: DuplicateMatchResult | undefined,
  reply: FastifyReply,
): Promise<FastifyReply> {
  // Query existing secondary resources associated with this patient
  const [existingCoverages, existingRelatedPersons] = await Promise.all([
    request.medplum.searchResources("Coverage", {
      patient: `Patient/${existingPatient.id}`,
    }),
    request.medplum.searchResources("RelatedPerson", {
      patient: `Patient/${existingPatient.id}`,
    }),
  ]);

  const targetMemberId = body.insurance?.memberId?.trim();
  const targetPayerId = body.insurance?.payerId?.trim();

  let resolvedCoverage: WithId<Coverage> | undefined =
    targetMemberId !== undefined && targetPayerId !== undefined
      ? existingCoverages.find((c) => {
          const matchMember = c.subscriberId?.trim() === targetMemberId;
          const matchPayor = c.payor?.some((p) => {
            const ref = p.reference ?? "";
            return (
              ref === `Organization/${targetPayerId}` ||
              ref.endsWith(`/${targetPayerId}`) ||
              ref === targetPayerId
            );
          });
          return Boolean(matchMember && matchPayor);
        })
      : undefined;

  const targetEscortName = body.escort?.name?.trim().toLowerCase();
  const targetEscortPhone = body.escort?.phone?.trim();

  let resolvedEscort: WithId<RelatedPerson> | undefined =
    targetEscortName !== undefined && targetEscortPhone !== undefined
      ? existingRelatedPersons.find((r) => {
          const matchName =
            r.name?.[0]?.text?.trim().toLowerCase() === targetEscortName ||
            r.name?.[0]?.family?.trim().toLowerCase() === targetEscortName;
          const matchPhone = r.telecom?.some(
            (t) => t.system === "phone" && t.value?.trim() === targetEscortPhone,
          );
          return Boolean(matchName && matchPhone);
        })
      : undefined;

  const secondaryTx = createTransaction({ facilityId });
  const confirmedPatientRef = { reference: `Patient/${existingPatient.id}` };
  let needsSecondaryTx = false;

  if (body.insurance !== undefined && resolvedCoverage === undefined) {
    const coverageResource = buildCoverage({
      facilityId,
      patientRef: confirmedPatientRef,
      payorId: body.insurance.payerId,
      subscriberId: body.insurance.memberId,
      planName: body.insurance.planName,
      groupNumber: body.insurance.groupNumber,
      relationship: body.insurance.relationship,
    });
    secondaryTx.add("coverage", coverageResource);
    needsSecondaryTx = true;
  }

  if (body.escort !== undefined && resolvedEscort === undefined) {
    const escortResource = buildRelatedPerson({
      facilityId,
      patientRef: confirmedPatientRef,
      relationship: body.escort.relationship,
      name: body.escort.name,
      telecom: [{ system: "phone", value: body.escort.phone }],
    });
    secondaryTx.add("escort", escortResource);
    needsSecondaryTx = true;
  }

  if (needsSecondaryTx) {
    const secondaryResponse = await writer.transaction(secondaryTx.build());
    let secIdx = 0;
    if (body.insurance !== undefined && resolvedCoverage === undefined) {
      resolvedCoverage = secondaryResponse.entry?.[secIdx]?.resource as WithId<Coverage> | undefined;
      secIdx++;
    }
    if (body.escort !== undefined && resolvedEscort === undefined) {
      resolvedEscort = secondaryResponse.entry?.[secIdx]?.resource as WithId<RelatedPerson> | undefined;
    }
  }

  request.log.info(
    { patientId: existingPatient.id, facilityId, recovered: true },
    "patient registration idempotently completed / recovered",
  );

  return reply.code(200).send({
    patient: existingPatient,
    coverage: resolvedCoverage,
    escort: resolvedEscort,
    duplicateMatch,
  });
}

function resolveFacilityId(
  request: FastifyRequest,
  preferredFacilityId?: string,
  allowDefaultFallback = false,
): string | undefined {
  if (preferredFacilityId !== undefined && preferredFacilityId.trim() !== "") {
    return preferredFacilityId.trim();
  }
  const headerValue = request.headers["x-facility-id"];
  if (typeof headerValue === "string" && headerValue.trim() !== "") {
    return headerValue.trim();
  }
  if (allowDefaultFallback && request.principal !== undefined) {
    const granted = grantedFacilityIds(request.principal);
    if (granted.length > 0) return granted[0];
  }
  return undefined;
}

async function handlePatientSearch(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  query: PatientSearchQuery,
): Promise<FastifyReply> {
  const facilityId = resolveFacilityId(request, query.facilityId, true);

  if (!(await app.guards.requireCapabilityAt(request, reply, "patient.read", facilityId))) {
    return reply;
  }

  const searchParams: Record<string, string> = {
    _count: String(query.limit ?? 20),
  };


  if (query.mrn !== undefined && query.mrn !== "") {
    searchParams["identifier"] = query.mrn;
  }
  if (query.name !== undefined && query.name !== "") {
    searchParams["name"] = query.name;
  }
  const dob = query.birthdate ?? query.dob;
  if (dob !== undefined && dob !== "") {
    searchParams["birthdate"] = dob;
  }

  const patients = await request.medplum.searchResources("Patient", searchParams);

  const facilityPatients =
    facilityId === undefined
      ? patients
      : patients.filter((p) =>
          p.meta?.accounts?.some((a) => a.reference === `Organization/${facilityId}`),
        );

  request.log.info({ facilityId, resultCount: facilityPatients.length }, "patients search completed");

  return reply.code(200).send({
    total: facilityPatients.length,
    patients: facilityPatients,
  });
}

export function patientsRoutes(app: FastifyInstance): Promise<void> {
  // POST /patients/search (PHI-safe demographic search via POST body per COMPLIANCE_AND_PHI §4)
  app.post(
    API_ROUTE_PATTERNS.patientsSearch,
    { config: capabilityAtResource("patient.read") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = patientSearchQuerySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send(formatZodError(parsed.error));
      }
      return handlePatientSearch(app, request, reply, parsed.data);
    },
  );

  // GET /patients/search (preserved for backward compatibility with query params sanitized by logger)
  app.get(
    API_ROUTE_PATTERNS.patientsSearch,
    { config: capabilityAtResource("patient.read") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = patientSearchQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send(formatZodError(parsed.error));
      }
      return handlePatientSearch(app, request, reply, parsed.data);
    },
  );

  // POST /patients/register
  app.post(
    API_ROUTE_PATTERNS.patientsRegister,
    { config: capabilityAtResource("patient.register") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = registerPatientSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(formatZodError(parsed.error));
      }
      const body = parsed.data;
      const facilityId = resolveFacilityId(request, body.facilityId, false);

      if (facilityId === undefined) {
        return reply.code(400).send({
          code: "bad_request",
          message: "Facility ID is required to register a patient.",
        });
      }

      if (!(await app.guards.requireCapabilityAt(request, reply, "patient.register", facilityId))) {
        return reply;
      }

      const registrationLock = app.facilityRegistrationLock ?? defaultFallbackLock;

      return registrationLock.withLock(
        facilityId,
        async () => {
          const facilityAccountRef = `Organization/${facilityId}`;
          const writer = forFacility(request.medplum, facilityId);

          // Query Medplum for duplicate candidates by family name, birthdate, or MRN.
          // Note: _account is not a valid FHIR search parameter on Patient; facility scoping is enforced
          // via AccessPolicy compartment rules and explicit meta.accounts filtering below.
          const candidateSearches: Promise<Patient[]>[] = [
            request.medplum.searchResources("Patient", {
              name: body.name.family,
              _count: "50",
            }),
            request.medplum.searchResources("Patient", {
              birthdate: body.dateOfBirth,
              _count: "50",
            }),
          ];

          if (body.mrn !== undefined && body.mrn !== "") {
            candidateSearches.push(
              request.medplum.searchResources("Patient", {
                identifier: body.mrn,
                _count: "10",
              }),
            );
          }

          const candidateResults = await Promise.all(candidateSearches);
          const candidatesById = new Map<string, Patient>();
          for (const list of candidateResults) {
            for (const candidate of list) {
              if (
                candidate.id !== undefined &&
                candidate.meta?.accounts?.some((a) => a.reference === facilityAccountRef)
              ) {
                candidatesById.set(candidate.id, candidate);
              }
            }
          }

          const candidateSummaries: ExistingPatientSummary[] = Array.from(candidatesById.values()).map((p) => {
            const family = p.name?.[0]?.family ?? "";
            const given = p.name?.[0]?.given?.[0] ?? "";
            const mrnId = p.identifier?.find((id) => id.system?.includes("mrn") || id.system === undefined)?.value;
            const ecwId = p.identifier?.find((id) => id.system?.startsWith("urn:wybit:ecw"))?.value;
            return {
              id: p.id ?? "",
              mrn: mrnId,
              ecwId,
              firstName: given,
              lastName: family,
              dateOfBirth: p.birthDate ?? "",
              gender: p.gender,
            };
          });

          const duplicateResult = evaluateDuplicateMatch(
            {
              mrn: body.mrn,
              firstName: body.name.given[0] ?? "",
              lastName: body.name.family,
              dateOfBirth: body.dateOfBirth,
              gender: body.gender,
            },
            candidateSummaries,
          );

          const isRetry = body.retry === true || request.headers["x-idempotent-retry"] === "true";

          if (duplicateResult.hasMatch) {
            if (duplicateResult.highestConfidence === "exact_identifier") {
              const matchingCandidate = candidateSummaries.find(
                (c) =>
                  c.mrn !== undefined &&
                  body.mrn !== undefined &&
                  c.mrn.trim().toLowerCase() === body.mrn.trim().toLowerCase(),
              );

              const isSameIdentity =
                matchingCandidate !== undefined &&
                matchingCandidate.lastName.trim().toLowerCase() === body.name.family.trim().toLowerCase() &&
                matchingCandidate.dateOfBirth === body.dateOfBirth;

              if (isRetry && isSameIdentity) {
                const existingPatient = candidatesById.get(matchingCandidate.id);
                if (existingPatient !== undefined) {
                  return completeOrRecoverRegistration(
                    existingPatient as WithId<Patient>,
                    body,
                    facilityId,
                    writer,
                    request,
                    duplicateResult,
                    reply,
                  );
                }
              }

              return reply.code(409).send({
                code: "duplicate_mrn_conflict",
                message: "A patient with this MRN already exists at this facility.",
                duplicateMatch: duplicateResult,
              });
            }

            if (duplicateResult.highestConfidence === "high" && !body.confirmDuplicate) {
              return reply.code(409).send({
                code: "duplicate_patient_detected",
                message: "Potential duplicate patient detected.",
                duplicateMatch: duplicateResult,
              });
            }
          }

          const telecom: { system: "phone" | "email"; value: string }[] = [];
          if (body.phone !== undefined && body.phone.trim() !== "") {
            telecom.push({ system: "phone", value: body.phone.trim() });
          }
          if (body.email !== undefined && body.email.trim() !== "") {
            telecom.push({ system: "email", value: body.email.trim() });
          }

          const hasAddress =
            body.address !== undefined &&
            ((body.address.line !== undefined && body.address.line.length > 0) ||
              (body.address.city !== undefined && body.address.city.trim() !== "") ||
              (body.address.state !== undefined && body.address.state.trim() !== "") ||
              (body.address.postalCode !== undefined && body.address.postalCode.trim() !== "") ||
              (body.address.country !== undefined && body.address.country.trim() !== ""));

          const address =
            hasAddress && body.address !== undefined
              ? [
                  {
                    ...(body.address.line !== undefined && body.address.line.length > 0
                      ? { line: body.address.line }
                      : {}),
                    ...(body.address.city !== undefined && body.address.city.trim() !== ""
                      ? { city: body.address.city.trim() }
                      : {}),
                    ...(body.address.state !== undefined && body.address.state.trim() !== ""
                      ? { state: body.address.state.trim() }
                      : {}),
                    ...(body.address.postalCode !== undefined && body.address.postalCode.trim() !== ""
                      ? { postalCode: body.address.postalCode.trim() }
                      : {}),
                    ...(body.address.country !== undefined && body.address.country.trim() !== ""
                      ? { country: body.address.country.trim() }
                      : {}),
                  },
                ]
              : undefined;

          const patientResource = buildPatient({
            facilityId,
            name: {
              family: body.name.family,
              given: body.name.given,
            },
            birthDate: body.dateOfBirth,
            gender: body.gender,
            mrn: body.mrn,
            telecom: telecom.length > 0 ? telecom : undefined,
            address,
          });

          const mrnSystem = fhirUrls.identifierSystem("mrn");
          const ifNoneExist =
            body.mrn !== undefined && body.mrn.trim() !== ""
              ? `identifier=${encodeURIComponent(`${mrnSystem}|${body.mrn.trim()}`)}`
              : undefined;

          // Step 1: Conditionally create the Patient resource first.
          // Secondary resources (Coverage, RelatedPerson) MUST NOT be committed in the same bundle
          // because FHIR transaction semantics resolve conditional create matches (HTTP 200) to the
          // existing patient and proceed to create child resources, leaking orphan records when Fastify returns 409.
          const patientTx = createTransaction({ facilityId });
          patientTx.add("patient", patientResource, ifNoneExist !== undefined ? { ifNoneExist } : undefined);
          const patientResponseBundle = await writer.transaction(patientTx.build());

          const patientEntry = patientResponseBundle.entry?.[0];
          const entryStatus = patientEntry?.response?.status;
          if (entryStatus === "200" || entryStatus?.startsWith("200") || entryStatus === "304") {
            const matchedPatient =
              (patientEntry?.resource as WithId<Patient> | undefined) ??
              (patientEntry?.response?.location
                ? await request.medplum.readReference<Patient>({
                    reference: patientEntry.response.location,
                  })
                : undefined);

            const matchedFamily = matchedPatient?.name?.[0]?.family?.trim().toLowerCase();
            const isSameIdentity =
              matchedPatient !== undefined &&
              matchedFamily === body.name.family.trim().toLowerCase() &&
              matchedPatient.birthDate === body.dateOfBirth;

            if (isRetry && isSameIdentity && matchedPatient !== undefined) {
              return completeOrRecoverRegistration(
                matchedPatient,
                body,
                facilityId,
                writer,
                request,
                duplicateResult,
                reply,
              );
            }

            return reply.code(409).send({
              code: "duplicate_mrn_conflict",
              message: "A patient with this MRN already exists at this facility.",
            });
          }

          const createdPatient = patientEntry?.resource as WithId<Patient> | undefined;
          if (createdPatient === undefined || createdPatient.id === undefined) {
            throw new Error("Transaction succeeded but patient was not returned");
          }

          // Step 2: Now that Patient creation is confirmed (HTTP 201), commit secondary resources
          // linked to the newly created Patient ID.
          let createdCoverage: WithId<Coverage> | undefined;
          let createdEscort: WithId<RelatedPerson> | undefined;

          if (body.insurance !== undefined || body.escort !== undefined) {
            const secondaryTx = createTransaction({ facilityId });
            const confirmedPatientRef = { reference: `Patient/${createdPatient.id}` };

            if (body.insurance !== undefined) {
              const coverageResource = buildCoverage({
                facilityId,
                patientRef: confirmedPatientRef,
                payorId: body.insurance.payerId,
                subscriberId: body.insurance.memberId,
                planName: body.insurance.planName,
                groupNumber: body.insurance.groupNumber,
                relationship: body.insurance.relationship,
              });
              secondaryTx.add("coverage", coverageResource);
            }

            if (body.escort !== undefined) {
              const escortResource = buildRelatedPerson({
                facilityId,
                patientRef: confirmedPatientRef,
                relationship: body.escort.relationship,
                name: body.escort.name,
                telecom: [{ system: "phone", value: body.escort.phone }],
              });
              secondaryTx.add("escort", escortResource);
            }

            try {
              const secondaryResponse = await writer.transaction(secondaryTx.build());
              let secIdx = 0;
              if (body.insurance !== undefined) {
                createdCoverage = secondaryResponse.entry?.[secIdx]?.resource as WithId<Coverage> | undefined;
                secIdx++;
              }
              if (body.escort !== undefined) {
                createdEscort = secondaryResponse.entry?.[secIdx]?.resource as WithId<RelatedPerson> | undefined;
              }
            } catch (secError) {
              request.log.error(
                { err: secError, patientId: createdPatient.id, facilityId },
                "secondary resource transaction failed during patient registration",
              );
              if (isAmbiguousNetworkError(secError)) {
                request.log.warn(
                  { err: secError, patientId: createdPatient.id, facilityId },
                  "secondary resource transaction failed due to ambiguous network error; skipping compensation delete to prevent orphaned child resources; patient record preserved for idempotent recovery",
                );
              } else {
                // Definitive failure: best-effort compensation removes incomplete Patient and child records
                try {
                  const [childCoverages, childEscorts] = await Promise.all([
                    request.medplum
                      .searchResources("Coverage", { patient: `Patient/${createdPatient.id}` })
                      .catch(() => []),
                    request.medplum
                      .searchResources("RelatedPerson", { patient: `Patient/${createdPatient.id}` })
                      .catch(() => []),
                  ]);
                  for (const c of childCoverages) {
                    if (c.id !== undefined) {
                      await request.medplum.deleteResource("Coverage", c.id).catch(() => {});
                    }
                  }
                  for (const rp of childEscorts) {
                    if (rp.id !== undefined) {
                      await request.medplum.deleteResource("RelatedPerson", rp.id).catch(() => {});
                    }
                  }
                  await request.medplum.deleteResource("Patient", createdPatient.id);
                  request.log.info(
                    { patientId: createdPatient.id, facilityId },
                    "compensated failed registration by deleting child resources and incomplete patient record",
                  );
                } catch (rollbackErr) {
                  request.log.warn(
                    { err: rollbackErr, patientId: createdPatient.id, facilityId },
                    "failed to delete incomplete patient or child resources during compensation; idempotent retry will recover",
                  );
                }
              }
              throw secError;
            }
          }

          request.log.info({ patientId: createdPatient.id, facilityId }, "patient registered successfully");

          return reply.code(201).send({
            patient: createdPatient,
            coverage: createdCoverage,
            escort: createdEscort,
            duplicateMatch: duplicateResult,
          });
        },
        request.tenant?.tenantId,
      );
    },
  );

  return Promise.resolve();
}
