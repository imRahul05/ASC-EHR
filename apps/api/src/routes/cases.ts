import { API_ROUTE_PATTERNS } from "@asc/config";
import type { FacilitySchedulingLock } from "@asc/types";
import { bookCaseSchema, transitionCaseSchema } from "@asc/validation";
import type { FastifyInstance } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";
import { casesController } from "../controllers/cases.controller.js";
import { requireCapabilityHook, requireCaseContext, validateBody } from "../hooks/case-context.js";

import { requireIdempotency } from "../hooks/idempotency.js";

// export
export { classifyMedplumReadError } from "../services/medplum-error-classifier.js";
export { createInMemorySchedulingLock } from "../services/case-booking-service.js";

declare module "fastify" {
  interface FastifyInstance {
    facilitySchedulingLock?: FacilitySchedulingLock;
  }
}

/**
 * Core Case Management Routes (Phase P15a/P15b/P15c / EP-C)
 *
 * Implements:
 * - Surgical case booking with facility-level advisory concurrency locks
 * - Fully hydrated Case Workspace detail retrieval
 * - Hard-gated clinical lifecycle transitions (Gate 1 and Gate 2 validation)
 */
export function casesRoutes(app: FastifyInstance): Promise<void> {
  // POST /cases — Book a surgical case into an operating room (Phase P15a/P15b)
  app.post(
    API_ROUTE_PATTERNS.cases,
    {
      config: capabilityAtResource("schedule.manage"),
      preHandler: [validateBody(bookCaseSchema)],
    },
    (request, reply) => casesController.bookCase(request, reply)
  );

  // GET /cases/:caseId — Fully hydrated Case Workspace detail bundle
  app.get(
    API_ROUTE_PATTERNS.case,
    {
      config: capabilityAtResource("case.read"),
      preHandler: [requireCapabilityHook("case.read"), requireCaseContext],
    },
    (request, reply) => casesController.getCase(request, reply)
  );

  // POST /cases/:caseId/transition — Validates and executes physical stage transitions
  app.post(
    API_ROUTE_PATTERNS.caseTransition,
    {
      config: capabilityAtResource("case.advance"),
      preHandler: [
        requireCapabilityHook("case.advance"),
        requireIdempotency,
        validateBody(transitionCaseSchema, "Invalid case transition payload"),
        requireCaseContext,
      ],
    },
    (request, reply) => casesController.transitionCase(request, reply)
  );



  return Promise.resolve();
}
