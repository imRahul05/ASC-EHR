import { forFacility } from "@asc/api-client/server";
import { grantedFacilityIds } from "@asc/authz";
import {
  evaluateDuplicateMatch,
  type ExistingPatientSummary,
} from "@asc/clinical-rules/patients/duplicate-match";
import { API_ROUTE_PATTERNS } from "@asc/config";
import {
  buildCoverage,
  buildPatient,
  buildRelatedPerson,
  createTransaction,
} from "@asc/fhir";
import {
  formatZodError,
  patientSearchQuerySchema,
  registerPatientSchema,
  type PatientSearchQuery,
} from "@asc/validation";
import type { WithId } from "@medplum/core";
import type { Coverage, Patient, RelatedPerson } from "@medplum/fhirtypes";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";

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

  if (facilityId !== undefined) {
    searchParams["_account"] = `Organization/${facilityId}`;
  }

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

      const facilityAccountRef = `Organization/${facilityId}`;

      // Query Medplum for duplicate candidates by family name, birthdate, or MRN scoped to facility
      const candidateSearches: Promise<Patient[]>[] = [
        request.medplum.searchResources("Patient", {
          _account: facilityAccountRef,
          name: body.name.family,
          _count: "50",
        }),
        request.medplum.searchResources("Patient", {
          _account: facilityAccountRef,
          birthdate: body.dateOfBirth,
          _count: "50",
        }),
      ];

      if (body.mrn !== undefined && body.mrn !== "") {
        candidateSearches.push(
          request.medplum.searchResources("Patient", {
            _account: facilityAccountRef,
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

      if (duplicateResult.hasMatch) {
        if (duplicateResult.highestConfidence === "exact_identifier") {
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

      const tx = createTransaction({ facilityId });
      const patientRef = tx.ref<Patient>("patient");
      tx.add("patient", patientResource);

      let hasCoverage = false;
      if (body.insurance !== undefined) {
        hasCoverage = true;
        const coverageResource = buildCoverage({
          facilityId,
          patientRef,
          payorId: body.insurance.payerId,
          subscriberId: body.insurance.memberId,
          planName: body.insurance.planName,
          groupNumber: body.insurance.groupNumber,
          relationship: body.insurance.relationship,
        });
        tx.add("coverage", coverageResource);
      }

      let hasEscort = false;
      if (body.escort !== undefined) {
        hasEscort = true;
        const escortResource = buildRelatedPerson({
          facilityId,
          patientRef,
          relationship: body.escort.relationship,
          name: body.escort.name,
          telecom: [{ system: "phone", value: body.escort.phone }],
        });
        tx.add("escort", escortResource);
      }

      const bundle = tx.build();
      const writer = forFacility(request.medplum, facilityId);
      const responseBundle = await writer.transaction(bundle);

      const createdPatient = responseBundle.entry?.[0]?.resource as WithId<Patient> | undefined;
      if (createdPatient === undefined || createdPatient.id === undefined) {
        throw new Error("Transaction succeeded but patient was not returned");
      }

      let createdCoverage: WithId<Coverage> | undefined;
      let nextIdx = 1;
      if (hasCoverage) {
        createdCoverage = responseBundle.entry?.[nextIdx]?.resource as WithId<Coverage> | undefined;
        nextIdx++;
      }

      let createdEscort: WithId<RelatedPerson> | undefined;
      if (hasEscort) {
        createdEscort = responseBundle.entry?.[nextIdx]?.resource as WithId<RelatedPerson> | undefined;
      }

      request.log.info({ patientId: createdPatient.id, facilityId }, "patient registered successfully");

      return reply.code(201).send({
        patient: createdPatient,
        coverage: createdCoverage,
        escort: createdEscort,
        duplicateMatch: duplicateResult,
      });
    },
  );

  return Promise.resolve();
}
