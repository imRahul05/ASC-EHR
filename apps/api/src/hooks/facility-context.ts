import { API_ERROR_CODES, type Capability } from "@asc/types";
import type { FastifyReply, FastifyRequest } from "fastify";
import "../auth/augment.js";
import "../plugins/error-handler.js";
import { resolveFacilityId } from "../routes/route-helpers.js";

declare module "fastify" {
  interface FastifyRequest {
    facilityId?: string;
  }
}

interface FacilityContextOptions {
  readonly allowPrincipalDefault?: boolean;
  readonly capability?: Capability;
  readonly errorCode?: typeof API_ERROR_CODES.FACILITY_REQUIRED | typeof API_ERROR_CODES.BAD_REQUEST;
  readonly errorMessage?: string;
}


export function requireFacilityContext(options?: FacilityContextOptions) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    let facilityId = request.facilityId;
    if (!facilityId) {
      facilityId = resolveFacilityId(request, undefined, options?.allowPrincipalDefault ?? true);
      if (facilityId) {
        request.facilityId = facilityId;
      }
    }

    if (!facilityId) {
      reply.sendApiError({
        code: options?.errorCode ?? API_ERROR_CODES.FACILITY_REQUIRED,
        message: options?.errorMessage ?? "Facility context is required",
      });
      return;
    }

    if (options?.capability) {
      const allowed = await request.server.guards.requireCapabilityAt(
        request,
        reply,
        options.capability,
        facilityId,
      );
      if (!allowed) {
        return;
      }
    }
  };
}
