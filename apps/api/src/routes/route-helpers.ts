import { grantedFacilityIds } from "@asc/authz";
import type { FastifyRequest } from "fastify";

export const FHIR_ID = /^[A-Za-z0-9._-]{1,64}$/;

interface QueryWithFacility {
  readonly facilityId?: string;
}

interface BodyWithFacility {
  readonly facilityId?: string;
}

/**
 * Resolves the target facility ID from the request using priority order:
 * 1. Explicit parameter in payload (e.g. preferredFacilityId)
 * 2. Body facilityId (e.g. body.facilityId)
 * 3. URL query parameter (?facilityId=...)
 * 4. HTTP Header (x-facility-id)
 * 5. User's primary granted facility in principal
 *
 * Validates against FHIR_ID regex to prevent injection attacks.
 */
export function resolveFacilityId(
  request: FastifyRequest,
  preferredFacilityId?: string
): string | undefined {
  if (preferredFacilityId !== undefined && preferredFacilityId.trim() !== "") {
    const trimmed = preferredFacilityId.trim();
    return FHIR_ID.test(trimmed) ? trimmed : undefined;
  }
  const body = request.body as BodyWithFacility | undefined;
  const bodyVal = typeof body?.facilityId === "string" ? body.facilityId.trim() : undefined;
  if (bodyVal !== undefined && bodyVal !== "") {
    return FHIR_ID.test(bodyVal) ? bodyVal : undefined;
  }
  const query = request.query as QueryWithFacility | undefined;
  const queryVal = query?.facilityId;
  if (typeof queryVal === "string" && queryVal.trim() !== "") {
    const trimmed = queryVal.trim();
    return FHIR_ID.test(trimmed) ? trimmed : undefined;
  }
  const headerValue = request.headers["x-facility-id"];
  if (typeof headerValue === "string" && headerValue.trim() !== "") {
    const trimmed = headerValue.trim();
    return FHIR_ID.test(trimmed) ? trimmed : undefined;
  }
  if (request.principal !== undefined) {
    const granted = grantedFacilityIds(request.principal);
    const first = granted[0];
    if (first !== undefined && FHIR_ID.test(first)) return first;
  }
  return undefined;
}
