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
    store.markInFlight("in-flight-key");

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
});
