import { API_ERROR_CODES, type ApiErrorPayload } from "@asc/types";
import { signConsentSchema } from "@asc/validation";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { forFacility } from "@asc/api-client/server";
import { registerErrorHandler } from "../plugins/error-handler.js";
import { CasesMockClient as MockClient } from "../testing/mock-medplum.js";
import { requireCaseContext } from "./case-context.js";


import { validateBody } from "./validation.js";

describe("case-context and validation hooks", () => {
  it("rejects with 400 facility_required when x-facility-id is missing", async () => {
    const app = Fastify();
    await app.register(registerErrorHandler);
    app.post("/cases/:caseId/test", { preHandler: [requireCaseContext] }, () => Promise.resolve({ ok: true }));
    await app.ready();

    const res = await app.inject({ method: "POST", url: "/cases/enc-123/test" });
    expect(res.statusCode).toBe(400);
    expect(res.json<ApiErrorPayload>()).toMatchObject({ code: API_ERROR_CODES.FACILITY_REQUIRED });
    await app.close();
  });

  it("rejects with 400 invalid_case_id when caseId is not valid FHIR ID", async () => {
    const app = Fastify();
    await app.register(registerErrorHandler);
    app.post("/cases/:caseId/test", { preHandler: [requireCaseContext] }, () => Promise.resolve({ ok: true }));
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/cases/bad$$case/test",
      headers: { "x-facility-id": "fac-1" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<ApiErrorPayload>()).toMatchObject({ code: API_ERROR_CODES.INVALID_CASE_ID });
    await app.close();
  });

  it("validateBody rejects invalid payload with 400 and formatZodError structure", async () => {
    const app = Fastify();
    await app.register(registerErrorHandler);
    app.post("/test-body", { preHandler: [validateBody(signConsentSchema)] }, () => Promise.resolve({ ok: true }));
    await app.ready();

    const res = await app.inject({ method: "POST", url: "/test-body", payload: {} });
    expect(res.statusCode).toBe(400);
    const json = res.json<ApiErrorPayload>();
    expect(json.code).toBe("invalid_payload");
    expect(json.message).toBe("Invalid request payload.");
    expect(json.details).toHaveProperty("caseId");
    await app.close();
  });

  it("validateBody parses valid JSON and replaces request.body", async () => {
    const app = Fastify();
    await app.register(registerErrorHandler);
    app.post("/test-body", { preHandler: [validateBody(signConsentSchema)] }, (req) => {
      return Promise.resolve({ ok: true, data: req.body });
    });
    await app.ready();

    const validPayload = {
      caseId: "case-123",
      procedureName: "Colonoscopy",
      procedureCode: "45378",
      performingPhysicianName: "Dr. Smith",
      signerName: "John Doe",
      signerRelationship: "patient" as const,
      signatureDataUrl: "data:image/png;base64," + "A".repeat(150),
      consentFormVersion: "1.0",
      risksAcknowledged: true as const,
      facilityId: "fac-1",
    };

    const res = await app.inject({ method: "POST", url: "/test-body", payload: validPayload });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, data: validPayload });
    await app.close();
  });

  it("rejects with 409 concurrency_conflict when If-Match version does not match encounter", async () => {
    const app = Fastify();
    await app.register(registerErrorHandler);
    const mockMedplum = new MockClient();
    await forFacility(mockMedplum, "fac-1").create({
      resourceType: "Encounter",
      id: "enc-123",
      status: "planned",
      class: { code: "AMB" },
    });

    app.decorateRequest("medplum", { getter: () => mockMedplum });

    app.post("/cases/:caseId/test", { preHandler: [requireCaseContext] }, () => Promise.resolve({ ok: true }));
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/cases/enc-123/test",
      headers: {
        "x-facility-id": "fac-1",
        "if-match": 'W/"999"',
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json<ApiErrorPayload>()).toMatchObject({ code: API_ERROR_CODES.CONCURRENCY_CONFLICT });
    await app.close();
  });

  it("succeeds and emits ETag header when If-Match matches encounter version", async () => {
    const app = Fastify();
    await app.register(registerErrorHandler);
    const mockMedplum = new MockClient();
    const created = await forFacility(mockMedplum, "fac-1").create({
      resourceType: "Encounter",
      id: "enc-123",
      status: "planned",
      class: { code: "AMB" },
    });
    const expectedEtag = `W/"${created.meta?.versionId}"`;

    app.decorateRequest("medplum", { getter: () => mockMedplum });

    app.post("/cases/:caseId/test", { preHandler: [requireCaseContext] }, () => Promise.resolve({ ok: true }));
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/cases/enc-123/test",
      headers: {
        "x-facility-id": "fac-1",
        "if-match": expectedEtag,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["etag"]).toBe(expectedEtag);
    await app.close();
  });


});

