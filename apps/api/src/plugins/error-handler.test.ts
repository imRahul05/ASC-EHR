import { API_ERROR_CODES, createGateBlockerError, type ApiErrorPayload } from "@asc/types";

import { signConsentSchema } from "@asc/validation";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerErrorHandler } from "./error-handler.js";

describe("error-handler plugin and sendApiError helper", () => {
  it("sends standard error with inferred status code and default message", async () => {
    const app = Fastify();
    await app.register(registerErrorHandler);
    app.get("/test-facility", async (_req, reply) => {
      return reply.sendApiError({ code: API_ERROR_CODES.FACILITY_REQUIRED });
    });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/test-facility" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      code: "facility_required",
      message: "Facility context is required.",
    });
    await app.close();
  });

  it("supports custom message, custom status, and structured details", async () => {
    const app = Fastify();
    await app.register(registerErrorHandler);
    app.get("/test-custom", async (_req, reply) => {
      return reply.sendApiError({
        code: API_ERROR_CODES.NOT_FOUND,
        message: "Case case_123 not found in facility fac_1",
        details: { caseId: "case_123" },
      });
    });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/test-custom" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      code: "not_found",
      message: "Case case_123 not found in facility fac_1",
      details: { caseId: "case_123" },
    });
    await app.close();
  });

  it("catches ZodError thrown in route handlers and formats with 400 invalid_payload", async () => {
    const app = Fastify();
    await app.register(registerErrorHandler);
    app.post("/test-zod", (req) => {
      signConsentSchema.parse(req.body);
      return Promise.resolve({ ok: true });
    });
    await app.ready();

    const res = await app.inject({ method: "POST", url: "/test-zod", payload: {} });
    expect(res.statusCode).toBe(400);
    const json = res.json<ApiErrorPayload>();
    expect(json.code).toBe("invalid_payload");
    expect(json.message).toBe("Invalid request payload.");
    expect(json.details).toHaveProperty("caseId");
    await app.close();
  });

  it("catches thrown DomainError and dispatches corresponding sendApiError response", async () => {
    const app = Fastify();
    await app.register(registerErrorHandler);
    app.get("/test-domain-error", () => {
      throw createGateBlockerError([{ code: "consent_unsigned", message: "Consent required" }]);
    });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/test-domain-error" });
    expect(res.statusCode).toBe(409);
    const json = res.json<ApiErrorPayload>();
    expect(json.code).toBe("GATE_FAILED");
    expect(json.message).toBe("Clinical gate rejected the transition.");
    expect(json.reasons).toEqual([{ code: "consent_unsigned", message: "Consent required" }]);
    await app.close();
  });
});
