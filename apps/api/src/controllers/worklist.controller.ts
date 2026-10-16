/**
 * Unified Worklist Controller (Phase P12)
 *
 * Implements endpoints for FHIR Task-backed clinical and administrative worklists:
 * - GET /worklist: lists work items with multi-dimensional filtering and SLA ordering
 * - POST /worklist: creates new work item (with idempotency support)
 * - POST /worklist/:itemId/claim: claims task with optimistic lock and capability check
 * - POST /worklist/:itemId/complete: marks work item completed with resolution narrative
 *
 * US Healthcare Citations:
 * - CMS 42 CFR § 416.52: Conditions for Coverage - Surgical Services (H&P validity, pre-op readiness).
 * - No Surprises Act 45 CFR § 149.610: Good Faith Estimates delivery and clearance tracking.
 * - HIPAA 45 CFR § 164.312(b): Technical safeguards and audit controls ensuring work items
 *   are claimed under capability-scoped authorization with provenance tracking.
 */

import { API_ERROR_CODES } from "@asc/types";
import type {
  ClaimWorkItemInput,
  CompleteWorkItemInput,
  CreateWorkItemInput,
  WorklistQuery,
} from "@asc/validation";
import type { FastifyReply, FastifyRequest } from "fastify";
import "../auth/augment.js";
import "../plugins/error-handler.js";
import "../plugins/medplum.js";
import { resolveFacilityId } from "../routes/route-helpers.js";
import {
  claimWorkItem,
  completeWorkItem,
  createWorkItem,
  getWorklist,
} from "../services/worklist-service.js";

interface ItemIdParams {
  readonly itemId: string;
}

export const worklistController = {
  async listWorkItems(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = request.query as WorklistQuery & { facilityId?: string };
    const facilityId = request.facilityId ?? resolveFacilityId(request, query?.facilityId, false);

    if (!facilityId) {
      return reply.sendApiError({
        code: API_ERROR_CODES.FACILITY_REQUIRED,
        message: "Facility context is required to view the worklist",
      });
    }

    if (!(await request.server.guards.requireCapabilityAt(request, reply, "case.read", facilityId))) {
      return reply;
    }

    const result = await getWorklist({
      medplum: request.medplum,
      facilityId,
      query,
      logger: request.log,
    });

    return reply.code(200).send(result);
  },

  async createWorkItem(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = request.body as CreateWorkItemInput & { facilityId?: string };
    const facilityId = request.facilityId ?? resolveFacilityId(request, body?.facilityId, false);

    if (!facilityId) {
      return reply.sendApiError({
        code: API_ERROR_CODES.FACILITY_REQUIRED,
        message: "Facility context is required to create a work item",
      });
    }

    if (!(await request.server.guards.requireCapabilityAt(request, reply, "case.advance", facilityId))) {
      return reply;
    }

    const item = await createWorkItem({
      medplum: request.medplum,
      facilityId,
      input: body,
      logger: request.log,
    });

    return reply.code(201).send(item);
  },

  async claimWorkItem(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { itemId } = request.params as ItemIdParams;
    const body = request.body as ClaimWorkItemInput & { facilityId?: string };
    const facilityId = request.facilityId ?? resolveFacilityId(request, body?.facilityId, false);

    if (!facilityId) {
      return reply.sendApiError({
        code: API_ERROR_CODES.FACILITY_REQUIRED,
        message: "Facility context is required to claim a work item",
      });
    }

    if (!request.principal) {
      return reply.sendApiError({
        code: API_ERROR_CODES.UNAUTHENTICATED,
        message: "Authentication is required to claim a work item",
      });
    }

    if (!(await request.server.guards.requireCapabilityAt(request, reply, "case.advance", facilityId))) {
      return reply;
    }

    const item = await claimWorkItem({
      medplum: request.medplum,
      facilityId,
      itemId,
      input: body,
      principal: request.principal,
      logger: request.log,
    });

    return reply.code(200).send(item);
  },

  async completeWorkItem(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { itemId } = request.params as ItemIdParams;
    const body = request.body as CompleteWorkItemInput & { facilityId?: string };
    const facilityId = request.facilityId ?? resolveFacilityId(request, body?.facilityId, false);

    if (!facilityId) {
      return reply.sendApiError({
        code: API_ERROR_CODES.FACILITY_REQUIRED,
        message: "Facility context is required to complete a work item",
      });
    }

    if (!request.principal) {
      return reply.sendApiError({
        code: API_ERROR_CODES.UNAUTHENTICATED,
        message: "Authentication is required to complete a work item",
      });
    }

    if (!(await request.server.guards.requireCapabilityAt(request, reply, "case.advance", facilityId))) {
      return reply;
    }

    const item = await completeWorkItem({
      medplum: request.medplum,
      facilityId,
      itemId,
      input: body,
      principal: request.principal,
      logger: request.log,
    });

    return reply.code(200).send(item);
  },
};
