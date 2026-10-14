import { grantedFacilityIds } from "@asc/authz";
import { API_ROUTE_PATTERNS } from "@asc/config";
import type { FacilitySchedulingLock } from "@asc/types";
import {
  bookCaseSchema,
  formatZodError,
  transitionCaseSchema,
  type BookCaseInput,
} from "@asc/validation";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";
import { bookCase, createInMemorySchedulingLock } from "../services/case-booking-service.js";
import { getCaseDetail, transitionCase } from "../services/case-read-service.js";

export { classifyMedplumReadError } from "../services/medplum-error-classifier.js";
export { createInMemorySchedulingLock } from "../services/case-booking-service.js";

declare module "fastify" {
  interface FastifyInstance {
    facilitySchedulingLock?: FacilitySchedulingLock;
  }
}

interface CaseRouteParams {
  readonly caseId: string;
}

interface CaseQuery {
  readonly facilityId?: string;
}

const FHIR_ID = /^[A-Za-z0-9.-]{1,64}$/;

function resolveFacilityId(
  request: FastifyRequest<{ Querystring: CaseQuery }>,
  preferredFacilityId?: string,
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

  // GET /cases/:caseId — Fully hydrated Case Workspace detail bundle
  app.get<{ Params: CaseRouteParams; Querystring: CaseQuery }>(
    API_ROUTE_PATTERNS.case,
    { config: capabilityAtResource("case.read") },
    async (request: FastifyRequest<{ Params: CaseRouteParams; Querystring: CaseQuery }>, reply: FastifyReply) => {
      const { caseId } = request.params;
      const facilityId = resolveFacilityId(request);

      if (!facilityId) {
        return reply.code(400).send({
          code: "facility_required",
          message: "Facility context is required to view a case",
        });
      }

      if (!FHIR_ID.test(caseId)) {
        return reply.code(400).send({
          code: "invalid_case_id",
          message: "Invalid case ID format",
        });
      }

      if (!(await app.guards.requireCapabilityAt(request, reply, "case.read", facilityId))) {
        return reply;
      }

      const detail = await getCaseDetail({
        medplum: request.medplum,
        facilityId,
        caseId,
      });

      if (!detail) {
        return reply.code(404).send({
          code: "not_found",
          message: `Case ${caseId} not found`,
        });
      }

      return reply.code(200).send(detail);
    },
  );

  // POST /cases/:caseId/transition — Validates and executes physical stage transitions
  app.post<{ Params: CaseRouteParams; Querystring: CaseQuery }>(
    API_ROUTE_PATTERNS.caseTransition,
    { config: capabilityAtResource("case.advance") },
    async (request: FastifyRequest<{ Params: CaseRouteParams; Querystring: CaseQuery }>, reply: FastifyReply) => {
      const { caseId } = request.params;
      const facilityId = resolveFacilityId(request);

      if (!facilityId) {
        return reply.code(400).send({
          code: "facility_required",
          message: "Facility context is required to transition a case",
        });
      }

      if (!FHIR_ID.test(caseId)) {
        return reply.code(400).send({
          code: "invalid_case_id",
          message: "Invalid case ID format",
        });
      }

      if (!(await app.guards.requireCapabilityAt(request, reply, "case.advance", facilityId))) {
        return reply;
      }

      const parsed = transitionCaseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          code: "invalid_payload",
          message: "Invalid case transition payload",
          details: formatZodError(parsed.error),
        });
      }

      const result = await transitionCase({
        medplum: request.medplum,
        facilityId,
        caseId,
        input: parsed.data,
        logger: request.log,
      });

      if (result.status === 404) {
        return reply.code(404).send({
          code: result.code,
          message: result.message,
        });
      }

      if (result.status === 409) {
        return reply.code(409).send({
          code: result.code,
          message: result.message,
          reasons: result.reasons,
        });
      }

      return reply.code(200).send(result.data);
    },
  );

  return Promise.resolve();
}
