/**
 * Attacks on the gates, end to end: forged tenant, facility and identity values in every
 * place a client controls (path, query, body, headers), and flood-limit evasion.
 */

import { facilityGrant, FakeTenantResolver, staffPrincipal, TEST_TENANT } from "@asc/authz/testing";
import { afterEach, describe, expect, it } from "vitest";

import { buildTestApp } from "../testing/test-app.js";
import { authenticatedRoute, capabilityRoute } from "./route-auth.js";

type Built = Awaited<ReturnType<typeof buildTestApp>>;
let built: Built | undefined;

afterEach(async () => {
  await built?.app.close();
  built = undefined;
});

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const OTHER_TENANT = { tenantId: "tenant-2", medplumProjectId: "project-2" };

async function setup(overrides: Parameters<typeof buildTestApp>[0] = {}): Promise<Built> {
  built = await buildTestApp(overrides);
  const { app, identity } = built;
  identity.addToken("rn-at-a", staffPrincipal([facilityGrant("A", ["rn"], ["case.read"])], "rn-a"));
  app.get("/facilities/:facilityId/cases", { config: capabilityRoute("case.read", { facilityParam: "facilityId" }) }, () => ({ ok: true }));
  app.post("/_test/who", { config: authenticatedRoute() }, (request) => ({
    userId: request.principal?.id ?? null,
    grants: request.principal?.grants.length ?? 0,
    tenantId: request.tenant?.tenantId ?? null,
  }));
  return built;
}

describe("facility tampering", () => {
  it("ignores repeated or conflicting facility values in the query string", async () => {
    const { app } = await setup();
    const response = await app.inject({
      method: "GET",
      url: "/facilities/B/cases?facilityId=A&facilityId=A&facilityId[]=A",
      headers: bearer("rn-at-a"),
    });
    expect(response.statusCode).toBe(403);
  });

  it("does not let path tricks reach another facility's route as A", async () => {
    const { app, audit } = await setup();
    for (const path of ["A%2F..%2FB", "B%2F..%2FA", "A;B", "A%00", "%41", "A%20", "a"]) {
      const response = await app.inject({ method: "GET", url: `/facilities/${path}/cases`, headers: bearer("rn-at-a") });
      // "%41" decodes to the real facility id A, so that one is legitimately allowed
      expect(response.statusCode, path).toBe(path === "%41" ? 200 : 403);
    }
    expect(audit.events.length).toBeGreaterThan(0);
  });

  it("keeps attacker-shaped facility values out of the audit trail", async () => {
    const { app, audit } = await setup();
    await app.inject({ method: "GET", url: "/facilities/A%27%3B%20DROP%20TABLE%20audit_events%3B--/cases", headers: bearer("rn-at-a") });
    expect(JSON.stringify(audit.events)).not.toContain("DROP");
  });
});

describe("identity tampering", () => {
  it("ignores a principal, grants or roles supplied in the body, query string or headers", async () => {
    const { app } = await setup();
    const response = await app.inject({
      method: "POST",
      url: "/_test/who?principal=admin&grants=all&role=admin",
      headers: {
        ...bearer("rn-at-a"),
        "content-type": "application/json",
        "x-user-id": "admin-1",
        "x-principal": '{"kind":"staff","grants":[{"scope":"all"}]}',
        "x-roles": "admin",
      },
      payload: { principal: { id: "admin-1", grants: [{ scope: "all", capabilities: ["admin.users"] }] }, userId: "admin-1" },
    });
    expect(response.json()).toEqual({ userId: "rn-a", grants: 1, tenantId: TEST_TENANT.tenantId });
  });

  it("does not let a second Authorization value or an odd scheme swap the identity", async () => {
    const { app, identity } = await setup();
    identity.addToken("admin-token", staffPrincipal([facilityGrant("A", ["admin"], ["case.read"])], "admin-1"));
    for (const authorization of ["Bearer rn-at-a, Bearer admin-token", "Bearer rn-at-a Bearer admin-token", "Bearer  rn-at-a", "bearer\trn-at-a"]) {
      const response = await app.inject({ method: "POST", url: "/_test/who", headers: { authorization } });
      expect(response.statusCode, authorization).toBe(401);
    }
  });

  it("refuses a token from tenant 1 presented to tenant 2's host (token project must equal the tenant's)", async () => {
    const { app, audit } = await setup({
      tenantResolver: new FakeTenantResolver({ "one.example": TEST_TENANT, "two.example": OTHER_TENANT }),
    });
    const ok = await app.inject({ method: "POST", url: "/_test/who", headers: { ...bearer("rn-at-a"), host: "one.example" } });
    expect(ok.statusCode).toBe(200);
    const crossed = await app.inject({ method: "POST", url: "/_test/who", headers: { ...bearer("rn-at-a"), host: "two.example" } });
    expect(crossed.statusCode).toBe(401);
    expect(audit.events[0]).toMatchObject({ gate: 2, tenantId: "tenant-2", details: { reason: "wrong-project" } });
  });

  it("does not take the host from forwarding headers", async () => {
    const { app } = await setup({
      tenantResolver: new FakeTenantResolver({ "one.example": TEST_TENANT, "two.example": OTHER_TENANT }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/_test/who",
      headers: { ...bearer("rn-at-a"), host: "one.example", "x-forwarded-host": "two.example", "x-original-host": "two.example", forwarded: "host=two.example" },
    });
    expect(response.json()).toMatchObject({ tenantId: TEST_TENANT.tenantId });
  });
});

describe("flood limit evasion", () => {
  it("is not reset by a spoofed X-Forwarded-For or a rotating request id", async () => {
    const { app } = await setup({ rateLimit: { ipMax: 3, userMax: 1000, windowMs: 60_000 } });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const response = await app.inject({
        method: "GET",
        url: "/health",
        remoteAddress: "203.0.113.50",
        headers: { "x-forwarded-for": `198.51.100.${i}`, "x-real-ip": `198.51.100.${i}`, "x-request-id": `req-${i}` },
      });
      statuses.push(response.statusCode);
    }
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
  });

  it("counts failed authentications, so guessing tokens is bounded", async () => {
    const { app, identity } = await setup({ rateLimit: { ipMax: 3, userMax: 1000, windowMs: 60_000 } });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const response = await app.inject({ method: "POST", url: "/_test/who", remoteAddress: "203.0.113.60", headers: bearer(`guess-${i}`) });
      statuses.push(response.statusCode);
    }
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
    expect(identity.calls).toHaveLength(3); // the provider was never asked after the limit
  });
});
