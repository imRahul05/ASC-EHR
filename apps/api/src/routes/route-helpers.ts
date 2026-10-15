import { grantedFacilityIds } from "@asc/authz";
import type { FastifyRequest } from "fastify";

export const FHIR_ID = /^[A-Za-z0-9._-]{1,64}$/;

interface QueryWithFacility {
  readonly facilityId?: string;
}

/**
 * Resolves the target facility ID from the request using priority order:
 * 1. Explicit parameter in payload (e.g. body.facilityId)
 * 2. URL query parameter (?facilityId=...)
 * 3. HTTP Header (x-facility-id)
 * 4. User's primary granted facility in principal
 *
 * Validates against FHIR_ID regex to prevent injection attacks.
 */
export function resolveFacilityId(
  request: FastifyRequest<{ Querystring?: QueryWithFacility }>,
  preferredFacilityId?: string
): string | undefined {
  if (preferredFacilityId !== undefined && preferredFacilityId.trim() !== "") {
    const trimmed = preferredFacilityId.trim();
    return FHIR_ID.test(trimmed) ? trimmed : undefined;
  }
  const queryVal = request.query?.facilityId;
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
