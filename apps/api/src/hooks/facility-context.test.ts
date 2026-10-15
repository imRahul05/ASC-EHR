import { describe, expect, it } from "vitest";
import fastify, { type FastifyInstance } from "fastify";
import { registerErrorHandler } from "../plugins/error-handler.js";
import { requireFacilityContext } from "./facility-context.js";

describe("facility-context hook", () => {
  it("rejects request without facility context", async () => {
    const app: FastifyInstance = fastify();
    await app.register(registerErrorHandler);
    app.get("/test", { preHandler: [requireFacilityContext()] }, async (req, reply) => {
      return reply.send({ facilityId: req.facilityId });
    });

    const res = await app.inject({
      method: "GET",
      url: "/test",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: "facility_required" });
  });

  it("extracts facilityId from x-facility-id header", async () => {
    const app: FastifyInstance = fastify();
    await app.register(registerErrorHandler);
    app.get("/test", { preHandler: [requireFacilityContext()] }, async (req, reply) => {
      return reply.send({ facilityId: req.facilityId });
    });

    const res = await app.inject({
      method: "GET",
      url: "/test",
      headers: { "x-facility-id": "fac-123" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ facilityId: "fac-123" });
  });
});
