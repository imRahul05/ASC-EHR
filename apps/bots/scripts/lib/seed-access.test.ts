import { compilePolicy, ROLE_TEMPLATES } from "@asc/authz";
import { describe, expect, it } from "vitest";

import { fakeMedplum, type Resource } from "./fake-medplum.js";
import { seedRolePolicies } from "./seed-access.js";
import { SECOND_FACILITY_KEY, seedFacility, staffRoleKeys } from "./seed.js";

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
