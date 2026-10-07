import type { IdentityPort } from "@asc/authz";
import { can } from "@asc/authz";
import { FakeIdentityPort, TEST_TENANT } from "@asc/authz/testing";
import { describe, expect, it } from "vitest";

import { buildTestApp } from "../testing/test-app.js";
import { DEV_FACILITY_ID, DevIdentityPort } from "./dev-identity.js";
import { assertIdentityAllowed, createIdentityPort, IdentityAdapterRefusedError } from "./select.js";

describe("createIdentityPort", () => {
  it("returns the dev-only fake outside production", () => {
    expect(createIdentityPort({ production: false, tenant: TEST_TENANT })).toBeInstanceOf(DevIdentityPort);
  });

  it("refuses to provide any adapter in production or staging until the real one exists", () => {
    expect(() => createIdentityPort({ production: true, tenant: TEST_TENANT })).toThrow(IdentityAdapterRefusedError);
  });
});

describe("assertIdentityAllowed", () => {
  const real: IdentityPort = { authenticate: () => Promise.resolve({ ok: false, reason: "invalid-token" }) };

  it("rejects the dev adapter and any other fake in production", () => {
    expect(() => assertIdentityAllowed(new DevIdentityPort(TEST_TENANT), true)).toThrow(IdentityAdapterRefusedError);
    expect(() => assertIdentityAllowed(new FakeIdentityPort(), true)).toThrow(IdentityAdapterRefusedError);
  });

  it("accepts fakes outside production and a real adapter everywhere", () => {
    expect(() => assertIdentityAllowed(new FakeIdentityPort(), false)).not.toThrow();
    expect(() => assertIdentityAllowed(real, true)).not.toThrow();
    expect(() => assertIdentityAllowed(real, false)).not.toThrow();
  });
});

describe("buildApp in production", () => {
  it("refuses to build with a fake identity adapter", async () => {
    await expect(buildTestApp({ production: true })).rejects.toBeInstanceOf(IdentityAdapterRefusedError);
    await expect(buildTestApp({ production: true, identity: new DevIdentityPort(TEST_TENANT) })).rejects.toBeInstanceOf(
      IdentityAdapterRefusedError,
    );
  });

  it("builds with a real adapter", async () => {
    const real: IdentityPort = { authenticate: () => Promise.resolve({ ok: false, reason: "invalid-token" }) };
    const { app } = await buildTestApp({ production: true, identity: real });
    await app.close();
  });
});

describe("DevIdentityPort", () => {
  it("serves one synthetic staff identity per role, with that role at the demo facility only", async () => {
    const port = new DevIdentityPort(TEST_TENANT);
    const result = await port.authenticate("dev-front-desk", TEST_TENANT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.principal.kind).toBe("staff");
    expect(can(result.principal, "patient.read", { facilityId: DEV_FACILITY_ID })).toBe(true);
    expect(can(result.principal, "patient.read", { facilityId: "another-facility" })).toBe(false);
    expect(can(result.principal, "admin.users", { facilityId: DEV_FACILITY_ID })).toBe(false);
  });

  it("has no patient identity and rejects unknown tokens", async () => {
    const port = new DevIdentityPort(TEST_TENANT);
    expect(await port.authenticate("dev-patient", TEST_TENANT)).toEqual({ ok: false, reason: "invalid-token" });
    expect(await port.authenticate("dev-nobody", TEST_TENANT)).toEqual({ ok: false, reason: "invalid-token" });
  });
});
