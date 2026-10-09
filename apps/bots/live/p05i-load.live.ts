import type { Bundle, PractitionerRole } from "@medplum/fhirtypes";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { caller, liveContext, userLogin } from "./harness.js";

/**
 * P05i (§4, #57): Load test of per-request PractitionerRole search and instant revocation.
 *
 * Verifies that querying PractitionerRole on every request with the user's token is fast
 * enough that no cross-request grant cache is needed, and that changes to grants take effect
 * on the very next request.
 */
const ctx = liveContext();

let user: Awaited<ReturnType<typeof ctx.inviteUser>>;
let token = "";
let facilityA = "";
let facilityB = "";
let profileRef = "";

beforeAll(async () => {
  facilityA = await ctx.facility("A");
  facilityB = await ctx.facility("B");
  const rnPolicyId = (await ctx.rolePolicy("rn")).id;

  user = await ctx.inviteUser("p05i-load", [ctx.access(rnPolicyId, facilityA)]);
  profileRef = user.membership.profile?.reference ?? "";

  const login = await userLogin(ctx.baseUrl, { email: user.email, password: user.password });
  token = login.accessToken;

  await ctx.admin.createResource<PractitionerRole>({
    resourceType: "PractitionerRole",
    active: true,
    practitioner: { reference: profileRef },
    organization: { reference: `Organization/${facilityA}` },
    code: [{ coding: [{ system: "https://asc-ehr.app/role-template", code: "rn" }] }],
  });
});

afterAll(async () => {
  for (const role of await ctx.admin.searchResources("PractitionerRole", { practitioner: profileRef })) {
    if (role.id !== undefined) await ctx.admin.deleteResource("PractitionerRole", role.id);
  }
  await user.remove();
});

describe("P05i per-request grant query performance and instant update", () => {
  it("load test: 50 grant searches with user token succeed quickly (p95 < 100ms)", async () => {
    const userCaller = caller(ctx.baseUrl, token);
    const path = `fhir/R4/PractitionerRole?practitioner=${profileRef}&active=true`;

    const latencies: number[] = [];
    const count = 50;

    for (let i = 0; i < count; i++) {
      const start = performance.now();
      const res = await userCaller.request("GET", path);
      const elapsed = performance.now() - start;
      latencies.push(elapsed);

      expect(res.status).toBe(200);
      const bundle = res.body as Bundle<PractitionerRole>;
      expect(bundle.entry).toBeDefined();
      expect(bundle.entry?.length).toBeGreaterThanOrEqual(1);
    }

    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(count * 0.95)] ?? 0;

    // Local Medplum query overhead check (< 100ms on localhost)
    expect(p95).toBeLessThan(100);
  });

  it("concurrent batch load: 5 batches of 10 concurrent requests all succeed quickly", async () => {
    const userCaller = caller(ctx.baseUrl, token);
    const path = `fhir/R4/PractitionerRole?practitioner=${profileRef}&active=true`;

    for (let batch = 0; batch < 5; batch++) {
      const promises = Array.from({ length: 10 }, async () => {
        const start = performance.now();
        const res = await userCaller.request("GET", path);
        const elapsed = performance.now() - start;
        return { res, elapsed };
      });

      const results = await Promise.all(promises);
      for (const { res, elapsed } of results) {
        expect(res.status).toBe(200);
        const bundle = res.body as Bundle<PractitionerRole>;
        expect(bundle.entry).toBeDefined();
        expect(bundle.entry?.length).toBeGreaterThanOrEqual(1);
        expect(elapsed).toBeLessThan(200);
      }
    }
  });

  it("instant update: grant changes are visible immediately without a cross-request cache", async () => {
    const userCaller = caller(ctx.baseUrl, token);
    const path = `fhir/R4/PractitionerRole?practitioner=${profileRef}&active=true`;

    // Query initial grants
    const initialRes = await userCaller.request("GET", path);
    expect(initialRes.status).toBe(200);
    const initialBundle = initialRes.body as Bundle<PractitionerRole>;
    const initialCount = initialBundle.entry?.length ?? 0;

    // Admin adds a temporary second grant for the user
    const tempRole = await ctx.admin.createResource<PractitionerRole>({
      resourceType: "PractitionerRole",
      active: true,
      practitioner: { reference: profileRef },
      organization: { reference: `Organization/${facilityB}` },
      code: [{ coding: [{ system: "https://asc-ehr.app/role-template", code: "rn" }] }],
    });

    try {
      // Immediate subsequent query sees the new grant
      const updatedRes = await userCaller.request("GET", path);
      expect(updatedRes.status).toBe(200);
      const updatedBundle = updatedRes.body as Bundle<PractitionerRole>;
      expect(updatedBundle.entry?.length).toBe(initialCount + 1);
    } finally {
      // Clean up the temporary grant
      if (tempRole.id !== undefined) {
        await ctx.admin.deleteResource("PractitionerRole", tempRole.id);
      }
    }

    // Immediate subsequent query reflects removal
    const finalRes = await userCaller.request("GET", path);
    expect(finalRes.status).toBe(200);
    const finalBundle = finalRes.body as Bundle<PractitionerRole>;
    expect(finalBundle.entry?.length).toBe(initialCount);
  });
});
