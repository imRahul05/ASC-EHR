import { API_ERROR_CODES, type ApiErrorPayload } from "@asc/types";
import { getScheduleQuerySchema, transitionCaseSchema } from "@asc/validation";
import type { Encounter } from "@medplum/fhirtypes";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { forFacility } from "@asc/api-client/server";
import { registerErrorHandler } from "../plugins/error-handler.js";
import { CasesMockClient as MockClient } from "../testing/mock-medplum.js";
import {
  createClinicalMutationPipeline,
  createClinicalQueryPipeline,
} from "./pipeline.js";

const testMutationSchema = transitionCaseSchema;
const testQuerySchema = getScheduleQuerySchema;

interface RouteResponse {
  readonly success: boolean;
  readonly caseId?: string;
  readonly body?: Record<string, string>;
  readonly query?: Record<string, string>;
}

interface TestGuards {
  requireCapabilityAt: (
    request: FastifyRequest,
    reply: FastifyReply,
    capability: string,
    facilityId: string | undefined,
  ) => Promise<boolean>;
  requireSameTenant: (
    request: FastifyRequest,
    reply: FastifyReply,
    ownerTenantId: string,
  ) => Promise<boolean>;
}

function createTestServer(options?: {
  readonly mockMedplum?: MockClient;
  readonly allowCapability?: boolean;
}): {
  readonly app: FastifyInstance;
  readonly mockMedplum: MockClient;
  readonly requireCapabilityAtSpy: ReturnType<typeof vi.fn>;
} {
  const app = Fastify();
  void app.register(registerErrorHandler);

  const mockMedplum = options?.mockMedplum ?? new MockClient();
  app.decorateRequest("medplum", { getter: () => mockMedplum });

  const requireCapabilityAtSpy = vi.fn(
    async (
      request: FastifyRequest,
      reply: FastifyReply,
      _capability: string,
      _facilityId: string | undefined,
    ): Promise<boolean> => {
      if (options?.allowCapability === false) {
        reply.sendApiError({
          code: API_ERROR_CODES.FORBIDDEN,
          status: 403,
          message: "You do not have access to this resource.",
        });
        return false;
      }
      request.facilityChecked = true;
      return true;
    },
  );

  const guards: TestGuards = {
    requireCapabilityAt: requireCapabilityAtSpy,
    requireSameTenant: vi.fn(
      (_request: FastifyRequest, _reply: FastifyReply, _ownerTenantId: string): Promise<boolean> => {
        return Promise.resolve(true);
      },
    ),
  };
  app.decorate("guards", guards);

  return { app, mockMedplum, requireCapabilityAtSpy };
}

describe("Composite Route Pre-Handler Pipeline", () => {
  it("executes hooks in canonical sequence on valid request", async () => {
    const { app, mockMedplum } = createTestServer();

    const created = await forFacility(mockMedplum, "fac-1").create<Encounter>({
      resourceType: "Encounter",
      id: "enc-valid-1",
      status: "planned",
      class: { code: "AMB" },
    });

    const pipeline = createClinicalMutationPipeline({
      capability: "case.advance",
      schema: testMutationSchema,
    });

    app.post(
      "/cases/:caseId/action",
      { preHandler: [...pipeline] },
      (request: FastifyRequest, reply: FastifyReply) => {
        return reply.send({
          success: true,
          caseId: request.caseContext?.caseId,
          body: request.body,
        });
      },
    );
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/cases/enc-valid-1/action",
      headers: {
        "x-facility-id": "fac-1",
      },
      payload: { to: "preop", reason: "Ready for pre-op" },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json<RouteResponse>();
    expect(json.success).toBe(true);
    expect(json.caseId).toBe(created.id);
    expect(json.body).toEqual({ to: "preop", reason: "Ready for pre-op" });

    await app.close();
  });

  it("halts with 403 Forbidden before caseContext when capability check fails", async () => {
    const { app, mockMedplum } = createTestServer({ allowCapability: false });

    // Spy on mockMedplum.readResource or search to ensure no case lookup happens
    const readSpy = vi.spyOn(mockMedplum, "search");

    const pipeline = createClinicalMutationPipeline({
      capability: "case.advance",
      schema: testMutationSchema,
    });

    app.post(
      "/cases/:caseId/action",
      { preHandler: [...pipeline] },
      (_request: FastifyRequest, reply: FastifyReply) => {
        return reply.send({ success: true });
      },
    );
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/cases/enc-probe-999/action",
      headers: {
        "x-facility-id": "fac-1",
      },
      payload: { to: "preop" },
    });

    expect(res.statusCode).toBe(403);
    const error = res.json<ApiErrorPayload>();
    expect(error.code).toBe(API_ERROR_CODES.FORBIDDEN);

    // HIPAA Security Rule verification: no upstream encounter query occurs on forbidden request
    expect(readSpy).not.toHaveBeenCalled();

    await app.close();
  });

  it("halts with 400 Bad Request when enforceIfMatch is true and If-Match header is missing", async () => {
    const { app, mockMedplum } = createTestServer();

    await forFacility(mockMedplum, "fac-1").create<Encounter>({
      resourceType: "Encounter",
      id: "enc-ifmatch-1",
      status: "planned",
      class: { code: "AMB" },
    });

    const pipeline = createClinicalMutationPipeline({
      capability: "case.advance",
      enforceIfMatch: true,
      schema: testMutationSchema,
    });

    app.post(
      "/cases/:caseId/action",
      { preHandler: [...pipeline] },
      (_request: FastifyRequest, reply: FastifyReply) => {
        return reply.send({ success: true });
      },
    );
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/cases/enc-ifmatch-1/action",
      headers: {
        "x-facility-id": "fac-1",
      },
      payload: { to: "preop" },
    });

    expect(res.statusCode).toBe(400);
    const error = res.json<ApiErrorPayload>();
    expect(error.code).toBe(API_ERROR_CODES.BAD_REQUEST);

    await app.close();
  });

  it("halts with 409 Concurrency Conflict when enforceIfMatch is true and version mismatches", async () => {
    const { app, mockMedplum } = createTestServer();

    await forFacility(mockMedplum, "fac-1").create<Encounter>({
      resourceType: "Encounter",
      id: "enc-ifmatch-2",
      status: "planned",
      class: { code: "AMB" },
    });

    const pipeline = createClinicalMutationPipeline({
      capability: "case.advance",
      enforceIfMatch: true,
      schema: testMutationSchema,
    });

    app.post(
      "/cases/:caseId/action",
      { preHandler: [...pipeline] },
      (_request: FastifyRequest, reply: FastifyReply) => {
        return reply.send({ success: true });
      },
    );
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/cases/enc-ifmatch-2/action",
      headers: {
        "x-facility-id": "fac-1",
        "if-match": 'W/"wrong-version-999"',
      },
      payload: { to: "preop" },
    });

    expect(res.statusCode).toBe(409);
    const error = res.json<ApiErrorPayload>();
    expect(error.code).toBe(API_ERROR_CODES.CONCURRENCY_CONFLICT);

    await app.close();
  });

  it("halts with 400 Invalid Payload when body schema fails validation", async () => {
    const { app, mockMedplum } = createTestServer();

    await forFacility(mockMedplum, "fac-1").create<Encounter>({
      resourceType: "Encounter",
      id: "enc-schema-1",
      status: "planned",
      class: { code: "AMB" },
    });

    const pipeline = createClinicalMutationPipeline({
      capability: "case.advance",
      schema: testMutationSchema,
      errorMessage: "Custom invalid mutation body",
    });

    let controllerReached = false;
    app.post(
      "/cases/:caseId/action",
      { preHandler: [...pipeline] },
      (_request: FastifyRequest, reply: FastifyReply) => {
        controllerReached = true;
        return reply.send({ success: true });
      },
    );
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/cases/enc-schema-1/action",
      headers: {
        "x-facility-id": "fac-1",
      },
      payload: { to: "invalid_stage_name" },
    });

    expect(res.statusCode).toBe(400);
    const error = res.json<ApiErrorPayload>();
    expect(error.code).toBe(API_ERROR_CODES.INVALID_PAYLOAD);
    expect(error.message).toBe("Custom invalid mutation body");
    expect(controllerReached).toBe(false);

    await app.close();
  });

  it("halts with 404 Not Found before schema validation if case does not exist", async () => {
    const { app } = createTestServer();

    const pipeline = createClinicalMutationPipeline({
      capability: "case.advance",
      schema: testMutationSchema,
    });

    app.post(
      "/cases/:caseId/action",
      { preHandler: [...pipeline] },
      (_request: FastifyRequest, reply: FastifyReply) => {
        return reply.send({ success: true });
      },
    );
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/cases/enc-non-existent/action",
      headers: {
        "x-facility-id": "fac-1",
      },
      payload: { to: "invalid_stage" }, // invalid payload
    });

    expect(res.statusCode).toBe(404);
    const error = res.json<ApiErrorPayload>();
    expect(error.code).toBe(API_ERROR_CODES.NOT_FOUND);

    await app.close();
  });

  it("replays idempotency cache without re-executing controller", async () => {
    const { app, mockMedplum } = createTestServer();

    await forFacility(mockMedplum, "fac-1").create<Encounter>({
      resourceType: "Encounter",
      id: "enc-idemp-1",
      status: "planned",
      class: { code: "AMB" },
    });

    const pipeline = createClinicalMutationPipeline({
      capability: "case.advance",
      schema: testMutationSchema,
    });

    let executionCount = 0;
    app.post(
      "/cases/:caseId/action",
      { preHandler: [...pipeline] },
      (_request: FastifyRequest, reply: FastifyReply) => {
        executionCount++;
        return reply.send({ success: true, executionCount });
      },
    );
    await app.ready();

    const res1 = await app.inject({
      method: "POST",
      url: "/cases/enc-idemp-1/action",
      headers: {
        "x-facility-id": "fac-1",
        "idempotency-key": "test-key-replay-1",
      },
      payload: { to: "preop" },
    });

    expect(res1.statusCode).toBe(200);
    expect(res1.json()).toEqual({ success: true, executionCount: 1 });
    expect(executionCount).toBe(1);

    const res2 = await app.inject({
      method: "POST",
      url: "/cases/enc-idemp-1/action",
      headers: {
        "x-facility-id": "fac-1",
        "idempotency-key": "test-key-replay-1",
      },
      payload: { to: "preop" },
    });

    expect(res2.statusCode).toBe(200);
    expect(res2.headers["idempotency-replayed"]).toBe("true");
    expect(res2.json()).toEqual({ success: true, executionCount: 1 });
    expect(executionCount).toBe(1);

    await app.close();
  });

  it("allows disabling idempotency via enableIdempotency: false", async () => {
    const { app, mockMedplum } = createTestServer();

    await forFacility(mockMedplum, "fac-1").create<Encounter>({
      resourceType: "Encounter",
      id: "enc-no-idemp-1",
      status: "planned",
      class: { code: "AMB" },
    });

    const pipeline = createClinicalMutationPipeline({
      capability: "case.advance",
      enableIdempotency: false,
      schema: testMutationSchema,
    });

    let executionCount = 0;
    app.post(
      "/cases/:caseId/action",
      { preHandler: [...pipeline] },
      (_request: FastifyRequest, reply: FastifyReply) => {
        executionCount++;
        return reply.send({ success: true, executionCount });
      },
    );
    await app.ready();

    const res1 = await app.inject({
      method: "POST",
      url: "/cases/enc-no-idemp-1/action",
      headers: {
        "x-facility-id": "fac-1",
        "idempotency-key": "same-key-disregarded",
      },
      payload: { to: "preop" },
    });
    expect(res1.statusCode).toBe(200);
    expect(executionCount).toBe(1);

    const res2 = await app.inject({
      method: "POST",
      url: "/cases/enc-no-idemp-1/action",
      headers: {
        "x-facility-id": "fac-1",
        "idempotency-key": "same-key-disregarded",
      },
      payload: { to: "preop" },
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.headers["idempotency-replayed"]).toBeUndefined();
    expect(executionCount).toBe(2);

    await app.close();
  });

  it("createClinicalQueryPipeline executes capability -> caseContext -> validateQuery", async () => {
    const { app, mockMedplum } = createTestServer();

    const created = await forFacility(mockMedplum, "fac-1").create<Encounter>({
      resourceType: "Encounter",
      id: "enc-query-1",
      status: "planned",
      class: { code: "AMB" },
    });

    const pipeline = createClinicalQueryPipeline({
      capability: "case.read",
      querySchema: testQuerySchema,
    });

    app.get(
      "/cases/:caseId/details",
      { preHandler: [...pipeline] },
      (request: FastifyRequest, reply: FastifyReply) => {
        return reply.send({
          success: true,
          caseId: request.caseContext?.caseId,
          query: request.query,
        });
      },
    );
    await app.ready();

    // 1. Valid request
    const validRes = await app.inject({
      method: "GET",
      url: "/cases/enc-query-1/details?date=2026-10-15",
      headers: { "x-facility-id": "fac-1" },
    });

    expect(validRes.statusCode).toBe(200);
    const json = validRes.json<RouteResponse>();
    expect(json.success).toBe(true);
    expect(json.caseId).toBe(created.id);
    expect(json.query).toEqual({ date: "2026-10-15" });

    // 2. Invalid query parameter (invalid date format)
    const invalidQueryRes = await app.inject({
      method: "GET",
      url: "/cases/enc-query-1/details?date=invalid-date",
      headers: { "x-facility-id": "fac-1" },
    });

    expect(invalidQueryRes.statusCode).toBe(400);
    const queryError = invalidQueryRes.json<ApiErrorPayload>();
    expect(queryError.code).toBe(API_ERROR_CODES.INVALID_QUERY);

    await app.close();
  });
});
