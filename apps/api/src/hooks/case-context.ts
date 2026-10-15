import type { Capability } from "@asc/types";
import { formatZodError, type ZodType } from "@asc/validation";
import type { Encounter } from "@medplum/fhirtypes";
import type { FastifyReply, FastifyRequest } from "fastify";

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

/**
 * Extracts and asserts that the request has a validated Case Context.
 * Throws an error if called on a route where `requireCaseContext` was not executed.
 */
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

/**
 * Reusable capability guard preHandler hook.
 *
 * Verifies that the authenticated principal possesses the required capability
 * scoped to the active facility before executing the controller or loading resources.
 */
export function requireCapabilityHook(capability: Capability) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const facilityId = request.caseContext?.facilityId ?? resolveFacilityId(request);

    if (!facilityId) {
      reply.code(400).send({
        code: "facility_required",
        message: "Facility context is required",
      });
      return;
    }

    const hasCap = await request.server.guards.requireCapabilityAt(request, reply, capability, facilityId);
    if (!hasCap) {
      return;
    }
  };
}

/**
 * Request payload validation preHandler hook.
 *
 * Validates request body against a Zod schema before database access
 * to fail fast with a 400 Bad Request on malformed inputs.
 */
export function validateBody<T>(schema: ZodType<T>, message = "Invalid payload") {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({
        code: "invalid_payload",
        message,
        details: formatZodError(parsed.error),
      });
      return;
    }
  };
}

/**
 * Case verification preHandler hook.
 *
 * 1. Resolves `facilityId` from header, query, body, or principal.
 * 2. Validates `caseId` format with FHIR_ID regex.
 * 3. Verifies tenant and facility ownership via `findAuthorizedEncounter`.
 * 4. Attaches `request.caseContext = { caseId, facilityId, encounter }`.
 */
export async function requireCaseContext(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const facilityId = request.caseContext?.facilityId ?? resolveFacilityId(request);

  if (!facilityId) {
    reply.code(400).send({
      code: "facility_required",
      message: "Facility context is required",
    });
    return;
  }

  const { caseId } = (request.params as CaseParams) ?? {};

  if (!caseId || !FHIR_ID.test(caseId)) {
    reply.code(400).send({
      code: "invalid_case_id",
      message: "Invalid case ID format",
    });
    return;
  }

  const encounter = await findAuthorizedEncounter(request.medplum, facilityId, caseId);

  if (!encounter) {
    reply.code(404).send({
      code: "not_found",
      message: `Case ${caseId} not found or does not belong to facility ${facilityId}`,
    });
    return;
  }

  request.caseContext = {
    caseId,
    facilityId,
    encounter,
  };
}
