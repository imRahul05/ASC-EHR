import type { AccessPolicy, Bundle, PractitionerRole, ProjectMembership } from "@medplum/fhirtypes";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { caller, liveContext, userLogin } from "./harness.js";

/**
 * Spike S7 (Medplum 5.1.42, synthetic user): does `/auth/me` carry the membership's `access[]` with its
 * parameters, enough to build grants? It does not. The user here holds two entries (rn at A, physician at
 * B) so the tests also show whether the resolved policy can pair a role with a facility, and the fallbacks
 * the identity adapter (P05i) can use instead are exercised against the live server.
 */
const ctx = liveContext();
let user: Awaited<ReturnType<typeof ctx.inviteUser>>;
let rnPolicyId = "";
let physicianPolicyId = "";
let facilityA = "";
let facilityB = "";
let me: Record<string, unknown>;
const profileRef = () => user.membership.profile?.reference ?? "";

beforeAll(async () => {
  facilityA = await ctx.facility("A");
  facilityB = await ctx.facility("B");
  rnPolicyId = (await ctx.rolePolicy("rn")).id;
  physicianPolicyId = (await ctx.rolePolicy("gi-physician")).id;
  user = await ctx.inviteUser("s7", [ctx.access(rnPolicyId, facilityA), ctx.access(physicianPolicyId, facilityB)]);
  const login = await userLogin(ctx.baseUrl, { email: user.email, password: user.password });
  const response = await caller(ctx.baseUrl, login.accessToken).request("GET", "auth/me");
  expect(response.status).toBe(200);
  me = response.body as Record<string, unknown>;
});

afterAll(async () => {
  for (const role of await ctx.admin.searchResources("PractitionerRole", { practitioner: profileRef() })) {
    if (role.id !== undefined) await ctx.admin.deleteResource("PractitionerRole", role.id);
  }
  await user.remove();
});

describe("S7 /auth/me payload", () => {
  it("has the user, project, membership, profile and the resolved access policy", () => {
    expect(Object.keys(me).sort()).toEqual(["accessPolicy", "config", "membership", "profile", "project", "security", "user"]);
    expect((me.project as { id: string }).id).toBe(ctx.projectId);
    expect((me.membership as ProjectMembership).id).toBe(user.membership.id);
    expect(`Practitioner/${(me.profile as { id: string }).id}`).toBe(profileRef());
  });

  it("does NOT include the membership's access[] or its parameters", () => {
    const membership = me.membership as ProjectMembership;
    expect(Object.keys(membership).sort()).toEqual(["id", "profile", "resourceType", "user"]);
    expect(membership.access).toBeUndefined();
  });

  it("names the template policies in basedOn but merges the rules: a role cannot be paired with its facility", () => {
    const policy = me.accessPolicy as AccessPolicy;
    expect((policy.basedOn ?? []).map((reference) => reference.reference).sort()).toEqual([`AccessPolicy/${physicianPolicyId}`, `AccessPolicy/${rnPolicyId}`].sort());
    const criteria = (policy.resource ?? []).filter((rule) => rule.resourceType === "Composition").map((rule) => rule.criteria);
    expect(criteria.sort()).toEqual([`Composition?_compartment=Organization/${facilityA}`, `Composition?_compartment=Organization/${facilityB}`].sort());
  });
});

describe("S7 fallback 1: read the membership", () => {
  it("is not grantable by an AccessPolicy: ProjectMembership is a protected type (403)", async () => {
    const policy = await ctx.policy({ resourceType: "AccessPolicy", name: "spike-s7-membership-reader", resource: [{ resourceType: "ProjectMembership", readonly: true }] });
    const { caller: reader } = await ctx.persona("spike-s7-membership-reader", [ctx.access(policy.id)]);
    expect((await reader.request("GET", `fhir/R4/ProjectMembership?profile=${profileRef()}`)).status).toBe(403);
  });

  it("works for a project-admin client, which also holds write power over every membership", async () => {
    const { caller: admin } = await ctx.persona("spike-s7-admin-reader", [], { admin: true });
    const found = await admin.request("GET", `fhir/R4/ProjectMembership?profile=${profileRef()}`);
    expect(found.status).toBe(200);
    const [membership] = ((found.body as Bundle<ProjectMembership>).entry ?? []).map((entry) => entry.resource);
    expect(membership?.access).toEqual([
      { policy: { reference: `AccessPolicy/${rnPolicyId}` }, parameter: [{ name: "facility", valueReference: { reference: `Organization/${facilityA}` } }] },
      { policy: { reference: `AccessPolicy/${physicianPolicyId}` }, parameter: [{ name: "facility", valueReference: { reference: `Organization/${facilityB}` } }] },
    ]);
  });
});

describe("S7 fallback 2: PractitionerRole as the readable copy of role and facility", () => {
  it("lets a client with only PractitionerRole and AccessPolicy read rights recover (role, facility) pairs", async () => {
    const practitionerId = profileRef().split("/")[1] ?? "";
    for (const [role, facilityId] of [["rn", facilityA], ["gi-physician", facilityB]] as const) {
      await ctx.admin.createResourceIfNoneExist<PractitionerRole>(
        {
          resourceType: "PractitionerRole",
          practitioner: { reference: profileRef() },
          organization: { reference: `Organization/${facilityId}` },
          code: [{ coding: [{ system: "https://asc-ehr.app/role-template", code: role }] }],
          identifier: [{ system: "urn:asc-ehr:spike", value: `s7-${practitionerId}-${role}` }],
        },
        `identifier=urn:asc-ehr:spike|s7-${practitionerId}-${role}`,
      );
    }
    const policy = await ctx.policy({
      resourceType: "AccessPolicy",
      name: "spike-s7-role-reader",
      resource: [{ resourceType: "PractitionerRole", readonly: true }, { resourceType: "AccessPolicy", readonly: true }],
    });
    const { caller: reader } = await ctx.persona("spike-s7-role-reader", [ctx.access(policy.id)]);
    const found = await reader.request("GET", `fhir/R4/PractitionerRole?practitioner=${profileRef()}`);
    expect(found.status).toBe(200);
    const pairs = ((found.body as Bundle<PractitionerRole>).entry ?? []).map((entry) => `${entry.resource?.code?.[0]?.coding?.[0]?.code}@${entry.resource?.organization?.reference}`).sort();
    expect(pairs).toEqual([`gi-physician@Organization/${facilityB}`, `rn@Organization/${facilityA}`]);
    expect((await reader.request("PUT", `fhir/R4/PractitionerRole/${(found.body as Bundle).entry?.[0]?.resource?.id}`, { ...(found.body as Bundle).entry?.[0]?.resource, active: false })).status).toBe(403);
  });
});
