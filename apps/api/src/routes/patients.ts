import { forFacility } from "@asc/api-client/server";
import { grantedFacilityIds } from "@asc/authz";
import {
  evaluateDuplicateMatch,
  type ExistingPatientSummary,
} from "@asc/clinical-rules/patients/duplicate-match";
import { API_ROUTE_PATTERNS } from "@asc/config";
import { buildCoverage, buildPatient, buildRelatedPerson } from "@asc/fhir";
import { patientSearchQuerySchema, registerPatientSchema } from "@asc/validation";
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

export function patientsRoutes(app: FastifyInstance): Promise<void> {
  // GET /patients/search
  app.get(
    API_ROUTE_PATTERNS.patientsSearch,
    { config: capabilityAtResource("patient.read") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = patientSearchQuerySchema.parse(request.query);
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

      request.log.info({ facilityId, resultCount: patients.length }, "patients search completed");

      return reply.code(200).send({
        total: patients.length,
        patients,
      });
    },
  );

  // POST /patients/register
  app.post(
    API_ROUTE_PATTERNS.patientsRegister,
    { config: capabilityAtResource("patient.register") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = registerPatientSchema.parse(request.body);
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

      // Query Medplum for duplicate candidates by family name, birthdate, or MRN
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
          if (candidate.id !== undefined) {
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

      const isHighDuplicate =
        duplicateResult.hasMatch &&
        (duplicateResult.highestConfidence === "exact_identifier" || duplicateResult.highestConfidence === "high");

      if (isHighDuplicate && !body.confirmDuplicate) {
        return reply.code(409).send({
          code: "duplicate_patient_detected",
          message: "Potential duplicate patient detected.",
          duplicateMatch: duplicateResult,
        });
      }

      const writer = forFacility(request.medplum, facilityId);

      const patientResource = buildPatient({
        facilityId,
        name: {
          family: body.name.family,
          given: body.name.given,
        },
        birthDate: body.dateOfBirth,
        gender: body.gender,
        mrn: body.mrn,
      });

      const createdPatient = await writer.create(patientResource);

      let createdCoverage: WithId<Coverage> | undefined;
      if (body.insurance !== undefined) {
        const coverageResource = buildCoverage({
          facilityId,
          patientId: createdPatient.id,
          payorId: body.insurance.payerId,
          subscriberId: body.insurance.memberId,
          planName: body.insurance.planName,
          groupNumber: body.insurance.groupNumber,
          relationship: body.insurance.relationship,
        });
        createdCoverage = await writer.create(coverageResource);
      }

      let createdEscort: WithId<RelatedPerson> | undefined;
      if (body.escort !== undefined) {
        const escortResource = buildRelatedPerson({
          facilityId,
          patientId: createdPatient.id,
          relationship: body.escort.relationship,
          name: body.escort.name,
          telecom: [{ system: "phone", value: body.escort.phone }],
        });
        createdEscort = await writer.create(escortResource);
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
