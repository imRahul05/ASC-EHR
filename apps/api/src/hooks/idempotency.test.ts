import { describe, expect, it } from "vitest";
import fastify, { type FastifyInstance } from "fastify";
import { registerErrorHandler } from "../plugins/error-handler.js";
import { createIdempotencyHook, createInMemoryIdempotencyStore } from "./idempotency.js";

describe("idempotency hook", () => {
  it("passes through without caching when idempotency key is missing", async () => {
    let callCount = 0;
    const store = createInMemoryIdempotencyStore();
    const app: FastifyInstance = fastify();
    await app.register(registerErrorHandler);

    app.post("/test", { preHandler: [createIdempotencyHook(store)] }, async (_req, reply) => {
      callCount++;
      return reply.send({ count: callCount });
    });

    const res1 = await app.inject({ method: "POST", url: "/test" });
    const res2 = await app.inject({ method: "POST", url: "/test" });

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(res1.json()).toEqual({ count: 1 });
    expect(res2.json()).toEqual({ count: 2 });
    expect(callCount).toBe(2);
  });

  it("replays cached response when same idempotency key is sent", async () => {
    let callCount = 0;
    const store = createInMemoryIdempotencyStore();
    const app: FastifyInstance = fastify();
    await app.register(registerErrorHandler);

    app.post("/test", { preHandler: [createIdempotencyHook(store)] }, async (_req, reply) => {
      callCount++;
      return reply.code(201).send({ count: callCount, success: true });
    });

    const res1 = await app.inject({
      method: "POST",
      url: "/test",
      headers: { "idempotency-key": "key-123" },
    });
    const res2 = await app.inject({
      method: "POST",
      url: "/test",
      headers: { "x-idempotency-key": "key-123" },
    });

    expect(res1.statusCode).toBe(201);
    expect(res2.statusCode).toBe(201);
    expect(res1.json()).toEqual({ count: 1, success: true });
    expect(res2.json()).toEqual({ count: 1, success: true });
    expect(res2.headers["idempotency-replayed"]).toBe("true");
    expect(callCount).toBe(1);
  });

  it("returns 409 conflict when request with same key is currently in-flight", async () => {
    const store = createInMemoryIdempotencyStore();
    store.markInFlight("route:POST:/test:in-flight-key");

    const app: FastifyInstance = fastify();
    await app.register(registerErrorHandler);

    app.post("/test", { preHandler: [createIdempotencyHook(store)] }, async (_req, reply) => {
      return reply.send({ ok: true });
    });

    const res = await app.inject({
      method: "POST",
      url: "/test",
      headers: { "idempotency-key": "in-flight-key" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: "idempotency_key_conflict" });
  });

  it("does not cache server errors (500)", async () => {
    let callCount = 0;
    const store = createInMemoryIdempotencyStore();
    const app: FastifyInstance = fastify();
    await app.register(registerErrorHandler);

    app.post("/test", { preHandler: [createIdempotencyHook(store)] }, async (_req, reply) => {
      callCount++;
      if (callCount === 1) {
        return reply.code(500).send({ error: "transient crash" });
      }
      return reply.code(200).send({ count: callCount });
    });

    const res1 = await app.inject({
      method: "POST",
      url: "/test",
      headers: { "idempotency-key": "retry-key" },
    });
    const res2 = await app.inject({
      method: "POST",
      url: "/test",
      headers: { "idempotency-key": "retry-key" },
    });

    expect(res1.statusCode).toBe(500);
    expect(res2.statusCode).toBe(200);
    expect(res2.json()).toEqual({ count: 2 });
    expect(callCount).toBe(2);
  });

  it("isolates cache between different routes using the same raw idempotency key", async () => {
    const store = createInMemoryIdempotencyStore();
    const app: FastifyInstance = fastify();
    await app.register(registerErrorHandler);

    let routeACalls = 0;
    let routeBCalls = 0;

    app.post("/action-a", { preHandler: [createIdempotencyHook(store)] }, async (_req, reply) => {
      routeACalls++;
      return reply.send({ route: "A", calls: routeACalls });
    });

    app.post("/action-b", { preHandler: [createIdempotencyHook(store)] }, async (_req, reply) => {
      routeBCalls++;
      return reply.send({ route: "B", calls: routeBCalls });
    });

    const resA = await app.inject({
      method: "POST",
      url: "/action-a",
      headers: { "idempotency-key": "shared-key-1" },
    });

    const resB = await app.inject({
      method: "POST",
      url: "/action-b",
      headers: { "idempotency-key": "shared-key-1" },
    });

    expect(resA.statusCode).toBe(200);
    expect(resA.json()).toEqual({ route: "A", calls: 1 });

    expect(resB.statusCode).toBe(200);
    expect(resB.json()).toEqual({ route: "B", calls: 1 });
    expect(resB.headers["idempotency-replayed"]).toBeUndefined();
    expect(routeACalls).toBe(1);
    expect(routeBCalls).toBe(1);
  });

  it("isolates cache between different cases using the same raw idempotency key", async () => {
    const store = createInMemoryIdempotencyStore();
    const app: FastifyInstance = fastify();
    await app.register(registerErrorHandler);

    let case1Calls = 0;
    let case2Calls = 0;

    app.post("/cases/:caseId/action", { preHandler: [createIdempotencyHook(store)] }, async (req, reply) => {
      const { caseId } = req.params as { readonly caseId?: string };
      if (caseId === "case-1") {
        case1Calls++;
        return reply.send({ caseId: "case-1", calls: case1Calls });
      }
      case2Calls++;
      return reply.send({ caseId: "case-2", calls: case2Calls });
    });

    const resCase1 = await app.inject({
      method: "POST",
      url: "/cases/case-1/action",
      headers: { "idempotency-key": "nurse-device-key-99" },
    });

    const resCase2 = await app.inject({
      method: "POST",
      url: "/cases/case-2/action",
      headers: { "idempotency-key": "nurse-device-key-99" },
    });

    expect(resCase1.statusCode).toBe(200);
    expect(resCase1.json()).toEqual({ caseId: "case-1", calls: 1 });

    expect(resCase2.statusCode).toBe(200);
    expect(resCase2.json()).toEqual({ caseId: "case-2", calls: 1 });
    expect(resCase2.headers["idempotency-replayed"]).toBeUndefined();
    expect(case1Calls).toBe(1);
    expect(case2Calls).toBe(1);
  });

  it("isolates cache between different tenants using the same raw idempotency key", async () => {
    const store = createInMemoryIdempotencyStore();
    const app: FastifyInstance = fastify();
    await app.register(registerErrorHandler);

    app.addHook("onRequest", (req, _reply, done) => {
      const tenantHeader = req.headers["x-tenant-id"];
      if (typeof tenantHeader === "string") {
        req.tenant = { tenantId: tenantHeader, medplumProjectId: `proj-${tenantHeader}` };
      }
      done();
    });

    let executionCount = 0;
    app.post("/tenant-action", { preHandler: [createIdempotencyHook(store)] }, async (req, reply) => {
      executionCount++;
      return reply.send({ tenant: req.tenant?.tenantId, execution: executionCount });
    });

    const resTenantA = await app.inject({
      method: "POST",
      url: "/tenant-action",
      headers: {
        "x-tenant-id": "tenant-alpha",
        "idempotency-key": "client-gen-key-1",
      },
    });

    const resTenantB = await app.inject({
      method: "POST",
      url: "/tenant-action",
      headers: {
        "x-tenant-id": "tenant-beta",
        "idempotency-key": "client-gen-key-1",
      },
    });

    expect(resTenantA.statusCode).toBe(200);
    expect(resTenantA.json()).toEqual({ tenant: "tenant-alpha", execution: 1 });

    expect(resTenantB.statusCode).toBe(200);
    expect(resTenantB.json()).toEqual({ tenant: "tenant-beta", execution: 2 });
    expect(resTenantB.headers["idempotency-replayed"]).toBeUndefined();
    expect(executionCount).toBe(2);
  });

  it("isolates cache between different work items (:itemId) using the same raw idempotency key", async () => {
    const store = createInMemoryIdempotencyStore();
    const app: FastifyInstance = fastify();
    await app.register(registerErrorHandler);

    let task1Calls = 0;
    let task2Calls = 0;

    app.post("/worklist/:itemId/claim", { preHandler: [createIdempotencyHook(store)] }, async (req, reply) => {
      const { itemId } = req.params as { readonly itemId?: string };
      if (itemId === "task-1") {
        task1Calls++;
        return reply.send({ itemId: "task-1", calls: task1Calls });
      }
      task2Calls++;
      return reply.send({ itemId: "task-2", calls: task2Calls });
    });

    const resItem1 = await app.inject({
      method: "POST",
      url: "/worklist/task-1/claim",
      headers: { "idempotency-key": "shared-client-key" },
    });

    const resItem2 = await app.inject({
      method: "POST",
      url: "/worklist/task-2/claim",
      headers: { "idempotency-key": "shared-client-key" },
    });

    expect(resItem1.statusCode).toBe(200);
    expect(resItem1.json()).toEqual({ itemId: "task-1", calls: 1 });

    expect(resItem2.statusCode).toBe(200);
    expect(resItem2.json()).toEqual({ itemId: "task-2", calls: 1 });
    expect(resItem2.headers["idempotency-replayed"]).toBeUndefined();
    expect(task1Calls).toBe(1);
    expect(task2Calls).toBe(1);
  });
});

