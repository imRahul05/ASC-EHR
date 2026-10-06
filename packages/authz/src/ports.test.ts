import { describe, expect, it } from "vitest";
import { facilityGrant, staffPrincipal, TEST_TENANT } from "./fixtures.js";
import { StaticTenantResolver, type TenantResolver } from "./ports.js";
import { FakeIdentityPort, FakeTenantResolver } from "./testing.js";

const principal = staffPrincipal([facilityGrant("A", ["rn"], ["case.read"])]);

describe("StaticTenantResolver", () => {
  it("returns the configured tenant regardless of host", async () => {
    const resolver: TenantResolver = new StaticTenantResolver(TEST_TENANT);
    expect(await resolver.resolve({ host: "anything.example" })).toEqual(TEST_TENANT);
    expect(await resolver.resolve({})).toEqual(TEST_TENANT);
  });
});

describe("FakeTenantResolver", () => {
  it("returns undefined for an unknown or missing host", async () => {
    const resolver = new FakeTenantResolver({ "acme.example": TEST_TENANT });
    expect(await resolver.resolve({ host: "acme.example" })).toEqual(TEST_TENANT);
    expect(await resolver.resolve({ host: "other.example" })).toBeUndefined();
    expect(await resolver.resolve({ host: "toString" })).toBeUndefined();
    expect(await resolver.resolve({})).toBeUndefined();
  });
});

describe("FakeIdentityPort", () => {
  it("authenticates a known token for the tenant's project", async () => {
    const port = new FakeIdentityPort();
    port.addToken("good", principal);
    expect(await port.authenticate("good", TEST_TENANT)).toEqual({ ok: true, principal, cache: "miss" });
  });

  it("rejects unknown tokens and tokens from another project", async () => {
    const port = new FakeIdentityPort();
    port.addToken("good", principal);
    expect(await port.authenticate("bad", TEST_TENANT)).toEqual({ ok: false, reason: "invalid-token" });
    const otherTenant = { ...TEST_TENANT, medplumProjectId: "project-2" };
    expect(await port.authenticate("good", otherTenant)).toEqual({ ok: false, reason: "wrong-project" });
  });

  it("reports unavailable, and bypass for step-up", async () => {
    const port = new FakeIdentityPort();
    port.addToken("good", principal);
    expect(await port.authenticate("good", TEST_TENANT, { stepUp: true })).toMatchObject({ cache: "bypass" });
    port.setUnavailable(true);
    expect(await port.authenticate("good", TEST_TENANT)).toEqual({ ok: false, reason: "unavailable" });
  });
});
