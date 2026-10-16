/**
 * Unified Worklist Routes (Phase P12)
 *
 * Implements FHIR Task-backed clinical and administrative worklists:
 * - GET /worklist: search and list work items
 * - POST /worklist: create work item
 * - POST /worklist/:itemId/claim: claim task
 * - POST /worklist/:itemId/complete: complete task
 *
 * US Healthcare Regulatory Citations:
 * - CMS 42 CFR § 416.52: Conditions for Coverage - Patient assessment & H&P validity.
 * - No Surprises Act 45 CFR § 149.610: Good Faith Estimates delivery.
 * - HIPAA 45 CFR § 164.312(b): Audit controls, technical access, and capability tracking.
 */

import { API_ROUTE_PATTERNS } from "@asc/config";
import {
  claimWorkItemSchema,
  completeWorkItemSchema,
  createWorkItemSchema,
  worklistQuerySchema,
} from "@asc/validation";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";
import { worklistController } from "../controllers/worklist.controller.js";
import { requireIdempotency } from "../hooks/idempotency.js";
import { validateBody, validateQuery } from "../hooks/validation.js";

export function worklistRoutes(app: FastifyInstance): Promise<void> {
  // GET /worklist — Unified worklist query across pre-op, intra-op, and post-discharge queues
  app.get(
    API_ROUTE_PATTERNS.worklist,
    {
      config: capabilityAtResource("case.read"),
      preHandler: [validateQuery(worklistQuerySchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return worklistController.listWorkItems(request, reply);
    },
  );

  // POST /worklist — Create a new clinical or administrative work item
  app.post(
    API_ROUTE_PATTERNS.worklist,
    {
      config: capabilityAtResource("case.advance"),
      preHandler: [requireIdempotency, validateBody(createWorkItemSchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return worklistController.createWorkItem(request, reply);
    },
  );

  // POST /worklist/:itemId/claim — Atomically claim task with capability check
  app.post(
    API_ROUTE_PATTERNS.workItemClaim,
    {
      config: capabilityAtResource("case.advance"),
      preHandler: [requireIdempotency, validateBody(claimWorkItemSchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return worklistController.claimWorkItem(request, reply);
    },
  );

  // POST /worklist/:itemId/complete — Mark task completed with resolution narrative
  app.post(
    API_ROUTE_PATTERNS.workItemComplete,
    {
      config: capabilityAtResource("case.advance"),
      preHandler: [requireIdempotency, validateBody(completeWorkItemSchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return worklistController.completeWorkItem(request, reply);
    },
  );

  return Promise.resolve();
}
