import { compilePolicy, ROLE_TEMPLATES } from "@asc/authz";
import { describe, expect, it } from "vitest";

import { fakeMedplum, type Resource } from "./fake-medplum.js";
import { demoEmail, mergeDemoUsers, seedDemoUsers, seedRolePolicies } from "./seed-access.js";
import { SECOND_FACILITY_KEY, seedFacility, seedPractitioners, staffRoleKeys } from "./seed.js";

const staff = ROLE_TEMPLATES.filter((template) => staffRoleKeys(ROLE_TEMPLATES).includes(template.key));
const policiesIn = (store: Resource[]) => store.filter((resource) => resource.resourceType === "AccessPolicy");

/** The fake with a counter on writes, to prove a second run changes nothing. */
function counted() {
  const { medplum, store } = fakeMedplum();
  const writes = { created: 0, updated: 0 };
  const wrapped = {
    ...(medplum as unknown as Record<string, (...args: never[]) => unknown>),
    createResource: (resource: never) => {
      writes.created++;
      return (medplum as { createResource: (r: never) => unknown }).createResource(resource);
    },
    updateResource: (resource: never) => {
      writes.updated++;
      return (medplum as { updateResource: (r: never) => unknown }).updateResource(resource);
    },
  };
  return { medplum: wrapped as never, store, writes };
}

describe("seedFacility", () => {
  it("seeds a second, differently keyed facility next to the first", async () => {
    const { medplum, store } = fakeMedplum();
    const first = await seedFacility(medplum);
    const second = await seedFacility(medplum, SECOND_FACILITY_KEY, "Demo Surgery Center 2 (synthetic)");
    expect(second).not.toBe(first);
    expect(await seedFacility(medplum, SECOND_FACILITY_KEY, "Demo Surgery Center 2 (synthetic)")).toBe(second);
    expect(store.filter((resource) => resource.resourceType === "Organization")).toHaveLength(2);
  });
});

describe("seedRolePolicies", () => {
  it("creates one compiled policy per staff role, named by key and version", async () => {
    const { medplum, store } = counted();
    const ids = await seedRolePolicies(medplum, staff);
    expect(Object.keys(ids)).toEqual(staff.map((template) => template.key));
    expect(policiesIn(store)).toHaveLength(staff.length);
    for (const template of staff) {
      const policy = store.find((resource) => resource.id === ids[template.key]);
      expect(policy).toMatchObject({ name: `${template.key}-v${template.version}`, resource: compilePolicy(template).resource });
    }
  });

  it("changes nothing on a second run", async () => {
    const { medplum, writes } = counted();
    const first = await seedRolePolicies(medplum, staff);
    const created = writes.created;
    expect(await seedRolePolicies(medplum, staff)).toEqual(first);
    expect(writes).toEqual({ created, updated: 0 });
  });

  it("restores a policy whose rules were edited by hand, keeping its id", async () => {
    const { medplum, store } = counted();
    const ids = await seedRolePolicies(medplum, staff);
    const rn = store.find((resource) => resource.id === ids.rn);
    if (rn === undefined) throw new Error("rn policy missing");
    rn.resource = [{ resourceType: "*" }];
    expect(await seedRolePolicies(medplum, staff)).toEqual(ids);
    expect(store.find((resource) => resource.id === ids.rn)?.resource).toEqual(compilePolicy(staff.find((t) => t.key === "rn") ?? staff[0]!).resource);
  });

  it("never emits a wildcard resource rule", async () => {
    const { medplum, store } = counted();
    await seedRolePolicies(medplum, staff);
    for (const policy of policiesIn(store)) {
      expect((policy.resource as { resourceType: string }[]).some((rule) => rule.resourceType === "*")).toBe(false);
    }
  });
});

describe("seedDemoUsers", () => {
  /** Everything the demo users depend on, seeded into one fake; `rerun` repeats only the user step. */
  async function setup() {
    const fake = fakeMedplum();
    const { medplum, store } = fake;
    const facilityId = await seedFacility(medplum);
    const policies = await seedRolePolicies(medplum, staff);
    const practitioners = await seedPractitioners(medplum, staffRoleKeys(ROLE_TEMPLATES));
    let n = 0;
    const input = { projectId: "project-1", facilityId, policies, practitioners, newPassword: () => `generated-${++n}` };
    const run = () => seedDemoUsers(medplum, staff, input);
    return { ...fake, facilityId, policies, practitioners, run, store, medplum };
  }
  const ofType = (store: Resource[], type: string) => store.filter((resource) => resource.resourceType === type);

  it("gives every staff role a membership holding its own policy, with the facility only for facility-scoped roles", async () => {
    const { run, store, policies, practitioners, facilityId } = await setup();
    const users = await run();
    expect(Object.keys(users)).toEqual(staff.map((template) => template.key));
    const memberships = ofType(store, "ProjectMembership");
    expect(memberships).toHaveLength(staff.length);
    for (const template of staff) {
      const membership = memberships.find((candidate) => (candidate.profile as { reference: string }).reference === `Practitioner/${practitioners[template.key]}`);
      expect(membership?.access).toEqual([
        {
          policy: { reference: `AccessPolicy/${policies[template.key]}` },
          ...(template.facilityScoped ? { parameter: [{ name: "facility", valueReference: { reference: `Organization/${facilityId}` } }] } : {}),
        },
      ]);
    }
    expect(staff.some((template) => template.facilityScoped)).toBe(true);
    expect(staff.some((template) => !template.facilityScoped)).toBe(true);
  });

  it("writes the readable PractitionerRole copy: role key and facility, no facility for all-site roles", async () => {
    const { run, store, facilityId } = await setup();
    await run();
    const roles = ofType(store, "PractitionerRole");
    expect(roles).toHaveLength(staff.length);
    for (const template of staff) {
      const role = roles.find((candidate) => (candidate.code as { coding: { code: string }[] }[])[0]?.coding[0]?.code === template.key);
      expect(role?.organization).toEqual(template.facilityScoped ? { reference: `Organization/${facilityId}` } : undefined);
    }
  });

  it("returns a distinct generated password per new user, and keeps it out of Medplum", async () => {
    const { run, store } = await setup();
    const users = await run();
    const passwords = Object.values(users).map((user) => user.password);
    expect(new Set(passwords).size).toBe(staff.length);
    expect(passwords.every((password) => typeof password === "string")).toBe(true);
    expect(JSON.stringify(store)).not.toContain("generated-");
  });

  it("changes nothing on a second run and returns no password", async () => {
    const { run, store, invites } = await setup();
    await run();
    const size = store.length;
    const second = await run();
    expect(store).toHaveLength(size);
    expect(invites).toHaveLength(staff.length);
    for (const user of Object.values(second)) expect(user).toEqual({ email: expect.stringMatching(/@example\.com$/) });
  });

  it("repairs a membership whose access list drifted, without inviting again", async () => {
    const { run, store, invites } = await setup();
    await run();
    const membership = ofType(store, "ProjectMembership")[0];
    if (membership === undefined) throw new Error("no membership");
    membership.access = [];
    await run();
    expect(ofType(store, "ProjectMembership").find((candidate) => candidate.id === membership.id)?.access).toHaveLength(1);
    expect(invites).toHaveLength(staff.length);
  });

  it("stays synthetic: reserved-domain emails only, no birth dates or addresses", async () => {
    const { run, store } = await setup();
    await run();
    for (const practitioner of ofType(store, "Practitioner")) {
      expect(practitioner).not.toHaveProperty("birthDate");
      expect(practitioner).not.toHaveProperty("address");
      for (const telecom of practitioner.telecom as { system: string; value: string }[]) {
        expect(telecom.system).toBe("email");
        expect(telecom.value).toBe(demoEmail((practitioner.name as { family: string }[])[0]?.family.replace("Demo-", "") ?? ""));
      }
    }
  });

  it("refuses to continue when a role has no seeded practitioner or policy", async () => {
    const { medplum } = await setup();
    await expect(seedDemoUsers(medplum, staff, { projectId: "p", facilityId: "f", policies: {}, practitioners: {} })).rejects.toThrow("no practitioner or policy");
  });
});

describe("mergeDemoUsers", () => {
  const created = { rn: { email: "demo-rn@example.com" }, admin: { email: "demo-admin@example.com", password: "new-one" } };

  it("keeps a previously stored password when this run generated none, and prefers a new one", () => {
    const previous = { users: { rn: { email: "demo-rn@example.com", password: "kept" }, admin: { email: "demo-admin@example.com", password: "old" } } };
    expect(mergeDemoUsers(previous, created)).toEqual({
      rn: { email: "demo-rn@example.com", password: "kept" },
      admin: { email: "demo-admin@example.com", password: "new-one" },
    });
  });

  it("drops a stored password whose email no longer matches, and tolerates a missing or damaged previous output", () => {
    expect(mergeDemoUsers({ users: { rn: { email: "other@example.com", password: "stale" } } }, created).rn).toEqual({ email: "demo-rn@example.com" });
    for (const previous of [undefined, null, "text", {}, { users: "text" }, { users: { rn: 3 } }]) {
      expect(mergeDemoUsers(previous, created).rn).toEqual({ email: "demo-rn@example.com" });
    }
  });
});
