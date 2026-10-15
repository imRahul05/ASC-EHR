import {
  bookCaseSchema,
  formatZodError,
  transitionCaseSchema,
  type BookCaseInput,
} from "@asc/validation";
import type { FastifyReply, FastifyRequest } from "fastify";

import { getCaseContext } from "../hooks/case-context.js";
import { bookCase, createInMemorySchedulingLock } from "../services/case-booking-service.js";
import { getCaseDetail, transitionCase } from "../services/case-read-service.js";

const defaultFallbackLock = createInMemorySchedulingLock();

/**
 * Controller for surgical case management endpoints.
 */
export const casesController = {
  async bookCase(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
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

    if (!(await request.server.guards.requireCapabilityAt(request, reply, "schedule.manage", facilityId))) {
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

    const schedulingLock = request.server.facilitySchedulingLock ?? defaultFallbackLock;

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
          }
    );
  },

  async getCase(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);

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

  async transitionCase(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);

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
};
