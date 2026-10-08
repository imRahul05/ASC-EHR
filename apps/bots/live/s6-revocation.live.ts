import type { Composition, ProjectMembership } from "@medplum/fhirtypes";
import { beforeAll, describe, expect, it } from "vitest";

import { type Caller, caller, clientCredentialsToken, liveContext, spikeCondition, spikeIdentifier, userLogin } from "./harness.js";

/**
 * Spike S6 (Medplum 5.1.42): how long does a disabled membership or a changed policy keep working at
 * gate 5 (Medplum itself)? Each test polls a protected call until it is refused and records the elapsed
 * time. Our own identity cache (gates 1-4, 60 s, P05i) adds at most its TTL on top. Not covered, because it
 * could not be shown to work on the local stack: a Subscription on ProjectMembership to clear that cache sooner
 * (see the ADR; P05i must not rely on it).
 */
const ctx = liveContext();
const LIMIT_MS = 5_000;
let facilityA = "";
let noteId = "";
const say = (line: string) => process.stdout.write(`S6 ${line}\n`);

/** Polls `call` until it returns a status other than `ok`; resolves with the elapsed ms and that status. */
async function untilRefused(call: () => Promise<number>, ok: number) {
  const start = Date.now();
  for (;;) {
    const status = await call();
    if (status !== ok) return { elapsed: Date.now() - start, status };
    if (Date.now() - start > LIMIT_MS) return { elapsed: Date.now() - start, status };
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
const read = (who: Caller) => async () => (await who.request("GET", `fhir/R4/Composition/${noteId}`)).status;

beforeAll(async () => {
  facilityA = await ctx.facility("A");
  const note = await ctx.admin.createResourceIfNoneExist<Composition>(
    { resourceType: "Composition", status: "preliminary", type: { text: "spike" }, date: "2026-01-01T00:00:00Z", author: [{ display: "spike" }], title: "spike s6", identifier: spikeIdentifier("s6-note"), meta: { account: { reference: `Organization/${facilityA}` } } },
    spikeCondition("s6-note"),
  );
  noteId = note.id ?? "";
});

describe("S6 gate 5 (Medplum) revocation", () => {
  it("stops a disabled membership on the next request; a token issued afterwards is refused too", async () => {
    const policy = await ctx.policy({ resourceType: "AccessPolicy", name: "spike-s6-open", resource: [{ resourceType: "Composition" }] });
    const { caller: who, membership, app } = await ctx.persona("spike-s6-disable", [ctx.access(policy.id)]);
    expect(await read(who)()).toBe(200);
    await ctx.admin.updateResource<ProjectMembership>({ ...membership, active: false });
    const { elapsed, status } = await untilRefused(read(who), 200);
    say(`membership disabled: first refusal after ${elapsed} ms (status ${status})`);
    expect(status).toBe(401);
    expect(elapsed).toBeLessThan(LIMIT_MS);
    // Medplum still issues a token to the disabled client; it is refused when used.
    const later = caller(ctx.baseUrl, await clientCredentialsToken(ctx.baseUrl, app.id ?? "", app.secret ?? ""));
    expect(await read(later)()).toBe(401);
  });

  it("stops a signed-in user's token when the membership is disabled", async () => {
    const policy = await ctx.policy({ resourceType: "AccessPolicy", name: "spike-s6-open", resource: [{ resourceType: "Composition" }] });
    const user = await ctx.inviteUser("s6", [ctx.access(policy.id)]);
    try {
      const login = await userLogin(ctx.baseUrl, { email: user.email, password: user.password });
      const who = caller(ctx.baseUrl, login.accessToken);
      expect(await read(who)()).toBe(200);
      await ctx.admin.updateResource<ProjectMembership>({ ...user.membership, active: false });
      const { elapsed, status } = await untilRefused(read(who), 200);
      say(`user membership disabled: first refusal after ${elapsed} ms (status ${status})`);
      expect(status).toBe(401);
      expect(elapsed).toBeLessThan(LIMIT_MS);
    } finally {
      await user.remove();
    }
  });

  it("applies an edited AccessPolicy on the next request", async () => {
    const policy = await ctx.policy({ resourceType: "AccessPolicy", name: "spike-s6-edit", resource: [{ resourceType: "Composition" }] });
    const { caller: who } = await ctx.persona("spike-s6-policy-edit", [ctx.access(policy.id)]);
    const write = async () => {
      const current = (await who.request("GET", `fhir/R4/Composition/${noteId}`)).body as Composition;
      return (await who.request("PUT", `fhir/R4/Composition/${noteId}`, { ...current, title: `spike s6 ${Date.now()}` })).status;
    };
    expect(await write()).toBe(200);
    await ctx.policy({ resourceType: "AccessPolicy", name: "spike-s6-edit", resource: [{ resourceType: "Composition", readonly: true }] });
    const { elapsed, status } = await untilRefused(write, 200);
    say(`policy edited to readonly: first refusal after ${elapsed} ms (status ${status})`);
    expect(status).toBe(403);
    expect(elapsed).toBeLessThan(LIMIT_MS);
  });

  it("applies a changed membership access list on the next request", async () => {
    const open = await ctx.policy({ resourceType: "AccessPolicy", name: "spike-s6-open", resource: [{ resourceType: "Composition" }] });
    const none = await ctx.policy({ resourceType: "AccessPolicy", name: "spike-s6-none", resource: [{ resourceType: "Patient", readonly: true }] });
    const { caller: who } = await ctx.persona("spike-s6-access-change", [ctx.access(open.id)]);
    expect(await read(who)()).toBe(200);
    await ctx.persona("spike-s6-access-change", [ctx.access(none.id)]);
    const { elapsed, status } = await untilRefused(read(who), 200);
    say(`membership access list changed: first refusal after ${elapsed} ms (status ${status})`);
    expect(status).toBe(403);
    expect(elapsed).toBeLessThan(LIMIT_MS);
  });
});
