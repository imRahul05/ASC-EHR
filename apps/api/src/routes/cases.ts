import { API_ROUTE_PATTERNS } from "@asc/config";
import type { FacilitySchedulingLock } from "@asc/types";
import { bookCaseSchema, formatZodError, type BookCaseInput } from "@asc/validation";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";
import { bookCase, createInMemorySchedulingLock } from "../services/case-booking-service.js";

export { classifyMedplumReadError } from "../services/medplum-error-classifier.js";
export { createInMemorySchedulingLock } from "../services/case-booking-service.js";

declare module "fastify" {
  interface FastifyInstance {
    facilitySchedulingLock?: FacilitySchedulingLock;
  }
}

const defaultFallbackLock = createInMemorySchedulingLock();

export function casesRoutes(app: FastifyInstance): Promise<void> {
  const schedulingLock = app.facilitySchedulingLock ?? defaultFallbackLock;

  // POST /cases — Book a surgical case into an operating room (Phase P15a/P15b)
  app.post(
    API_ROUTE_PATTERNS.cases,
    { config: capabilityAtResource("schedule.manage") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = bookCaseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          code: "invalid_payload",
          message: "Invalid case booking payload",
          details: formatZodError(parsed.error),
        });
      }

      const body: BookCaseInput = parsed.data;
      const facilityId = body.facilityId.trim();

      if (!(await app.guards.requireCapabilityAt(request, reply, "schedule.manage", facilityId))) {
        return reply;
      }

      const tenantId = request.tenant?.tenantId;
      if (!tenantId) {
        return reply.code(403).send({
          code: "forbidden",
          message: "Tenant context is required",
        });
      }

      const rawHeaderKey = request.headers["x-idempotency-key"] ?? request.headers["idempotency-key"];
      const headerIdempotencyKey =
        typeof rawHeaderKey === "string" && rawHeaderKey.trim().length > 0
          ? rawHeaderKey.trim()
          : undefined;

      const result = await bookCase({
        medplum: request.medplum,
        schedulingLock,
        tenantId,
        facilityId,
        body,
        headerIdempotencyKey,
        logger: request.log,
      });

      return reply.code(result.status).send(
        "data" in result
          ? result.data
          : {
              code: result.code,
              message: result.message,
              ...("details" in result ? { details: result.details } : {}),
              ...("reasons" in result ? { reasons: result.reasons } : {}),
            },
      );
    },
  );

  return Promise.resolve();
}
