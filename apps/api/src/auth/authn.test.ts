import type { IdentityFailure, IdentityPort, IdentityResult } from "@asc/authz";
import { facilityGrant, staffPrincipal, TEST_TENANT } from "@asc/authz/testing";
import { afterEach, describe, expect, it } from "vitest";

import { buildTestApp } from "../testing/test-app.js";
import { authenticatedRoute, capabilityRoute, publicRoute } from "./route-auth.js";

type Built = Awaited<ReturnType<typeof buildTestApp>>;
let built: Built | undefined;

afterEach(async () => {
  await built?.app.close();
  built = undefined;
});

const principal = staffPrincipal([facilityGrant("A", ["rn"], ["case.read"])]);

async function setup(overrides: Parameters<typeof buildTestApp>[0] = {}): Promise<Built> {
  built = await buildTestApp(overrides);
  built.identity.addToken("good-token", principal);
  built.app.get("/_test/whoami", { config: authenticatedRoute() }, (request) => ({
    userId: request.principal?.id ?? null,
    cache: request.identityCache ?? null,
  }));
  built.app.get("/_test/open", { config: publicRoute() }, () => ({ open: true }));
  built.app.post("/_test/sign", { config: capabilityRoute("note.sign") }, () => ({ signed: true }));
  built.app.get("/_test/read", { config: capabilityRoute("case.read") }, () => ({ read: true }));
  return built;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe("gate 2: authentication", () => {
  it("accepts a valid token and binds the principal", async () => {
    const { app, audit } = await setup();
    const response = await app.inject({ method: "GET", url: "/_test/whoami", headers: bearer("good-token") });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ userId: principal.id, cache: "miss" });
    expect(audit.events).toHaveLength(0);
  });

  it("answers 401 without a bearer token and audits gate 2", async () => {
    const { app, audit } = await setup();
    const response = await app.inject({ method: "GET", url: "/_test/whoami" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ code: "unauthenticated", message: "Authentication required." });
    expect(audit.events[0]).toMatchObject({
      action: "auth.denied",
      outcome: "DENIED",
      gate: 2,
      actorId: "anonymous",
      tenantId: TEST_TENANT.tenantId,
      details: { reason: "invalid-token" },
    });
  });

  it("refuses malformed Authorization headers without asking the identity provider", async () => {
    const { app, identity } = await setup();
    for (const authorization of ["Basic Zm9vOmJhcg==", "Bearer", "Bearer ", "Bearer two tokens", "good-token", ""]) {
      const response = await app.inject({ method: "GET", url: "/_test/whoami", headers: { authorization } });
      expect(response.statusCode, authorization).toBe(401);
    }
    expect(identity.calls).toHaveLength(0);
  });

  it("answers 401 for an unknown token", async () => {
    const { app, audit } = await setup();
    const response = await app.inject({ method: "GET", url: "/_test/whoami", headers: bearer("nope") });
    expect(response.statusCode).toBe(401);
    expect(audit.events[0]).toMatchObject({ gate: 2, details: { reason: "invalid-token" } });
  });

  it("answers 401 when the token was issued for another project", async () => {
    const { app, identity, audit } = await setup();
    identity.addToken("other-project-token", { ...principal, tenant: { ...TEST_TENANT, medplumProjectId: "project-2" } });
    const response = await app.inject({ method: "GET", url: "/_test/whoami", headers: bearer("other-project-token") });
    expect(response.statusCode).toBe(401);
    expect(audit.events[0]).toMatchObject({ gate: 2, details: { reason: "wrong-project" } });
  });

  it("answers 401 when an adapter returns a principal of another tenant", async () => {
    const { app, identity, audit } = await setup();
    identity.addToken("cross-tenant", { ...principal, tenant: { tenantId: "tenant-2", medplumProjectId: TEST_TENANT.medplumProjectId } });
    const response = await app.inject({ method: "GET", url: "/_test/whoami", headers: bearer("cross-tenant") });
    expect(response.statusCode).toBe(401);
    expect(audit.events[0]).toMatchObject({ gate: 2, details: { reason: "wrong-project" } });
  });

  it("maps every identity failure: inactive membership is 401, unavailable is 503 and not audited", async () => {
    const failing = (reason: IdentityFailure): IdentityPort => ({
      authenticate: (): Promise<IdentityResult> => Promise.resolve({ ok: false, reason }),
    });
    for (const [reason, status, audited] of [
      ["invalid-token", 401, true],
      ["wrong-project", 401, true],
      ["inactive-membership", 401, true],
      ["unavailable", 503, false],
    ] as const) {
      const { app, audit } = await setup({ identity: failing(reason) });
      const response = await app.inject({ method: "GET", url: "/_test/whoami", headers: bearer("any") });
      expect(response.statusCode, reason).toBe(status);
      expect(audit.events.length > 0, reason).toBe(audited);
      await app.close();
      built = undefined;
    }
  });

  it("never allows while the identity provider is down, even for a previously valid token", async () => {
    const { app, identity } = await setup();
    identity.setUnavailable(true);
    const response = await app.inject({ method: "GET", url: "/_test/whoami", headers: bearer("good-token") });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain(principal.id);
  });

  it("leaves public routes open and never asks the identity provider", async () => {
    const { app, identity } = await setup();
    expect((await app.inject({ method: "GET", url: "/_test/open" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    expect(identity.calls).toHaveLength(0);
  });

  it("makes the adapter bypass its cache for step-up capabilities only", async () => {
    const { app, identity } = await setup();
    identity.addToken("signer", staffPrincipal([facilityGrant("A", ["gi-physician"], ["note.sign"])], "signer-1"));
    await app.inject({ method: "POST", url: "/_test/sign", headers: bearer("signer") });
    await app.inject({ method: "GET", url: "/_test/read", headers: bearer("good-token") });
    expect(identity.calls).toEqual([
      { token: "signer", stepUp: true },
      { token: "good-token", stepUp: false },
    ]);
  });

  it("never logs, audits or echoes the token", async () => {
    const { app, audit } = await setup();
    const secret = "CANARY-SECRET-TOKEN";
    const response = await app.inject({ method: "GET", url: "/_test/whoami", headers: bearer(secret) });
    expect(response.body).not.toContain(secret);
    expect(JSON.stringify(audit.events)).not.toContain(secret);
  });

  it("limits each tenant and user separately, after the caller is known", async () => {
    const { app, identity } = await setup({ rateLimit: { ipMax: 1000, userMax: 2, windowMs: 60_000 } });
    identity.addToken("second-user", staffPrincipal([facilityGrant("A", ["rn"], ["case.read"])], "user-2"));
    const call = (token: string) => app.inject({ method: "GET", url: "/_test/whoami", headers: bearer(token) });
    const first = [await call("good-token"), await call("good-token"), await call("good-token")];
    expect(first.map((r) => r.statusCode)).toEqual([200, 200, 429]);
    expect(first[2]?.headers["retry-after"]).toBeDefined();
    expect(first[2]?.json()).toMatchObject({ code: "rate_limited" });
    expect((await call("second-user")).statusCode).toBe(200);
  });
});
