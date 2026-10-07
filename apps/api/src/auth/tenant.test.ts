import { FakeTenantResolver, TEST_TENANT } from "@asc/authz/testing";
import { afterEach, describe, expect, it } from "vitest";

import { buildTestApp } from "../testing/test-app.js";
import { publicRoute } from "./route-auth.js";

type TestApp = Awaited<ReturnType<typeof buildTestApp>>["app"];
let app: TestApp | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** A throw-away route that reports which tenant the request was bound to. */
function addTenantEcho(target: TestApp): void {
  target.post("/_test/tenant", { config: publicRoute() }, (request) => ({ tenantId: request.tenant?.tenantId ?? null }));
}

describe("gate 1: tenant", () => {
  it("binds the request to the tenant the resolver returns", async () => {
    let audit;
    ({ app, audit } = await buildTestApp());
    addTenantEcho(app);
    const response = await app.inject({ method: "POST", url: "/_test/tenant" });
    expect(response.json()).toEqual({ tenantId: TEST_TENANT.tenantId });
    expect(audit.events).toHaveLength(0);
  });

  it("never takes the tenant from the body, the query string or a header", async () => {
    ({ app } = await buildTestApp());
    addTenantEcho(app);
    const response = await app.inject({
      method: "POST",
      url: "/_test/tenant?tenantId=attacker-tenant&tenant=attacker-tenant",
      headers: { "x-tenant-id": "attacker-tenant", "x-tenant": "attacker-tenant", "content-type": "application/json" },
      payload: { tenantId: "attacker-tenant", tenant: { tenantId: "attacker-tenant" }, medplumProjectId: "attacker-project" },
    });
    expect(response.json()).toEqual({ tenantId: TEST_TENANT.tenantId });
  });

  it("answers 404 for an unknown tenant, with a generic body, and audits gate 1", async () => {
    let audit;
    ({ app, audit } = await buildTestApp({ tenantResolver: new FakeTenantResolver({ "known.example": TEST_TENANT }) }));
    addTenantEcho(app);
    const response = await app.inject({ method: "POST", url: "/_test/tenant", headers: { host: "unknown.example" } });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: "not_found", message: "Not found." });
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      action: "auth.denied",
      outcome: "DENIED",
      gate: 1,
      actorId: "anonymous",
      requestId: expect.any(String),
      details: { reason: "unknown-tenant" },
    });
    expect(audit.events[0]).not.toHaveProperty("tenantId");
  });

  it("does not reveal unknown-host details in the response or the audit event", async () => {
    let audit;
    ({ app, audit } = await buildTestApp({ tenantResolver: new FakeTenantResolver({}) }));
    addTenantEcho(app);
    const response = await app.inject({ method: "POST", url: "/_test/tenant", headers: { host: "secret-clinic.example" } });
    expect(response.body).not.toContain("secret-clinic");
    expect(JSON.stringify(audit.events)).not.toContain("secret-clinic");
  });

  it("answers the denial even when the audit write fails", async () => {
    ({ app } = await buildTestApp({
      tenantResolver: new FakeTenantResolver({}),
      audit: { logEvent: () => Promise.reject(new Error("audit store down")) },
    }));
    addTenantEcho(app);
    const response = await app.inject({ method: "POST", url: "/_test/tenant" });
    expect(response.statusCode).toBe(404);
  });

  it("keys the flood limit by tenant and address", async () => {
    const other = { tenantId: "tenant-2", medplumProjectId: "project-2" };
    ({ app } = await buildTestApp({
      rateLimit: { ipMax: 1, userMax: 1000, windowMs: 60_000 },
      tenantResolver: new FakeTenantResolver({ "a.example": TEST_TENANT, "b.example": other }),
    }));
    const ip = "203.0.113.9";
    const send = (host: string) => app!.inject({ method: "GET", url: "/health", headers: { host }, remoteAddress: ip });
    expect((await send("a.example")).statusCode).toBe(200);
    expect((await send("b.example")).statusCode).toBe(200); // same address, other tenant: own budget
    expect((await send("a.example")).statusCode).toBe(429);
  });
});
