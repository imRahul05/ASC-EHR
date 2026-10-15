import { API_ERROR_CODES, type Capability } from "@asc/types";
import type { Encounter } from "@medplum/fhirtypes";
import type { FastifyReply, FastifyRequest } from "fastify";
import "../auth/augment.js";
import "../plugins/error-handler.js";
import "../plugins/medplum.js";
import { FHIR_ID, resolveFacilityId } from "../routes/route-helpers.js";
import { findAuthorizedEncounter } from "../services/encounter-lookup.js";


declare module "fastify" {
  interface FastifyRequest {
    caseContext?: {
      readonly caseId: string;
      readonly facilityId: string;
      readonly encounter: Encounter;
    };
  }
}

interface CaseParams {
  readonly caseId?: string;
}

export function getCaseContext(request: FastifyRequest): {
  readonly caseId: string;
  readonly facilityId: string;
  readonly encounter: Encounter;
} {
  if (!request.caseContext) {
    throw new Error("caseContext is missing. Ensure requireCaseContext preHandler is attached.");
  }
  return request.caseContext;
}

export function requireCapabilityHook(capability: Capability) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const facilityId = request.caseContext?.facilityId ?? resolveFacilityId(request);
    if (!facilityId) {
      reply.sendApiError({ code: API_ERROR_CODES.FACILITY_REQUIRED });
      return;
    }
    const hasCap = await request.server.guards.requireCapabilityAt(request, reply, capability, facilityId);
    if (!hasCap) return;
  };
}

export async function requireCaseContext(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const facilityId = request.caseContext?.facilityId ?? resolveFacilityId(request);
  if (!facilityId) {
    reply.sendApiError({ code: API_ERROR_CODES.FACILITY_REQUIRED });
    return;
  }
  const { caseId } = (request.params as CaseParams) ?? {};
  if (!caseId || !FHIR_ID.test(caseId)) {
    reply.sendApiError({ code: API_ERROR_CODES.INVALID_CASE_ID });
    return;
  }
  const encounter = await findAuthorizedEncounter(request.medplum, facilityId, caseId);
  if (!encounter) {
    reply.sendApiError({
      code: API_ERROR_CODES.NOT_FOUND,
      message: `Case ${caseId} not found or does not belong to facility ${facilityId}`,
    });
    return;
  }

  const ifMatchHeader = request.headers["if-match"];
  if (typeof ifMatchHeader === "string" && ifMatchHeader.trim() !== "") {
    const rawExpected = ifMatchHeader.trim();
    const match = rawExpected.match(/^(?:W\/)?"?([^"]+)"?$/);
    const expectedVersion = match ? match[1] : rawExpected;
    const currentVersion = encounter.meta?.versionId;
    if (currentVersion && expectedVersion !== "*" && expectedVersion !== currentVersion) {
      reply.sendApiError({
        code: API_ERROR_CODES.CONCURRENCY_CONFLICT,
        status: 409,
        message: `Case ${caseId} has been modified concurrently (upstream version W/"${currentVersion}" != expected W/"${expectedVersion}"). Please refetch latest case state.`,
      });
      return;
    }
  }

  if (encounter.meta?.versionId) {
    reply.header("ETag", `W/"${encounter.meta.versionId}"`);
  }

  request.caseContext = { caseId, facilityId, encounter };
}

