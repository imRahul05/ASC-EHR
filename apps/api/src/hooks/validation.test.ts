import { describe, expect, it } from "vitest";
import fastify, { type FastifyInstance } from "fastify";
import { getScheduleQuerySchema, registerPatientSchema } from "@asc/validation";
import { validateBody, validateQuery } from "./validation.js";

describe("validation hooks", () => {
  const bodySchema = registerPatientSchema;
  const querySchema = getScheduleQuerySchema;


  it("validates request body successfully", async () => {
    const app: FastifyInstance = fastify();
    app.post("/test-body", { preHandler: [validateBody(bodySchema)] }, async (req, reply) => {
      return reply.send({ received: req.body });
    });

    const validPatient = {
      facilityId: "fac-1",
      name: { family: "Smith", given: ["John"] },
      dateOfBirth: "1990-01-01",
      gender: "male",
      phone: "555-123-4567",
    };


    const res = await app.inject({
      method: "POST",
      url: "/test-body",
      payload: validPatient,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: validPatient });
  });

  it("rejects invalid request body with 400 and formatted error", async () => {
    const app: FastifyInstance = fastify();
    app.post("/test-body", { preHandler: [validateBody(bodySchema)] }, async (req, reply) => {
      return reply.send({ received: req.body });
    });

    const res = await app.inject({
      method: "POST",
      url: "/test-body",
      payload: { name: { family: "" } },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty("details");
  });


  it("validates request query successfully", async () => {
    const app: FastifyInstance = fastify();
    app.get("/test-query", { preHandler: [validateQuery(querySchema)] }, async (req, reply) => {
      return reply.send({ received: req.query });
    });

    const res = await app.inject({
      method: "GET",
      url: "/test-query?date=2026-10-15",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: { date: "2026-10-15" } });
  });

  it("rejects invalid request query with 400 and formatted error", async () => {
    const app: FastifyInstance = fastify();
    app.get("/test-query", { preHandler: [validateQuery(querySchema)] }, async (req, reply) => {
      return reply.send({ received: req.query });
    });

    const res = await app.inject({
      method: "GET",
      url: "/test-query?date=invalid-date",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty("details");
  });
});
