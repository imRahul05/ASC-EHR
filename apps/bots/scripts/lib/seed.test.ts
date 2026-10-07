import { ROLE_TEMPLATES } from "@asc/authz";
import { describe, expect, it } from "vitest";

import {
  ensureProject,
  seedFacility,
  seedPractitioners,
  staffRoleKeys,
  stringField,
} from "./seed.js";

type Resource = { resourceType: string; id?: string; [key: string]: unknown };

/** An in-memory stand-in for the Medplum client: just the calls the seed makes. */
function fakeMedplum(initial: Resource[] = []) {
  const store: Resource[] = [...initial];
  let counter = 0;
  const posts: string[] = [];
  const withId = (resource: Resource): Resource => ({ ...resource, id: resource.id ?? `id-${++counter}` });

  const medplum = {
    createResourceIfNoneExist: (resource: Resource, query: string) => {
      const value = query.split("|")[1];
      const found = store.find(
        (candidate) =>
          candidate.resourceType === resource.resourceType &&
          (candidate.identifier as { value: string }[] | undefined)?.some((identifier) => identifier.value === value),
      );
      if (found) return Promise.resolve(found);
      const created = withId(resource);
      store.push(created);
      return Promise.resolve(created);
    },
    createResource: (resource: Resource) => {
      const created = withId(resource);
      store.push(created);
      return Promise.resolve(created);
    },
    updateResource: (resource: Resource) => {
      const index = store.findIndex((candidate) => candidate.id === resource.id);
      store[index] = resource;
      return Promise.resolve(resource);
    },
    searchResources: (type: string, query: Record<string, string>) =>
      Promise.resolve(
        store.filter((candidate) => {
          if (candidate.resourceType !== type) return false;
          if (query["name:exact"] !== undefined) return candidate.name === query["name:exact"];
          if (query.user !== undefined) return (candidate.user as { reference: string } | undefined)?.reference === query.user;
          return true;
        }),
      ),
    fhirUrl: (...parts: string[]) => new URL(parts.join("/"), "http://fake.test/fhir/R4/"),
    post: (url: URL | string, body: unknown) => {
      posts.push(String(url));
      const created = withId({ resourceType: "Project", name: (body as { parameter: { valueString: string }[] }).parameter[0]?.valueString });
      store.push(created);
      return Promise.resolve(created);
    },
  };
  return { medplum: medplum as never, store, posts };
}

const countOf = (store: Resource[], type: string) => store.filter((resource) => resource.resourceType === type).length;

describe("ensureProject", () => {
  it("creates the project once with $init and finds it afterwards", async () => {
    const { medplum, posts, store } = fakeMedplum();
    const first = await ensureProject(medplum);
    const second = await ensureProject(medplum);
    expect(first.created).toBe(true);
    expect(second).toEqual({ id: first.id, created: false });
    expect(posts).toHaveLength(1);
    expect(posts[0]).toContain("Project/$init");
    expect(countOf(store, "Project")).toBe(1);
  });

  it("fails clearly when Medplum returns no project id", async () => {
    const { medplum } = fakeMedplum();
    const broken = { ...(medplum as object), post: () => Promise.resolve({}) } as never;
    await expect(ensureProject(broken)).rejects.toThrow("did not return the new project id");
  });
});

describe("seedFacility", () => {
  it("creates one synthetic facility and returns the same id on a second run", async () => {
    const { medplum, store } = fakeMedplum();
    const first = await seedFacility(medplum);
    const second = await seedFacility(medplum);
    expect(second).toBe(first);
    expect(countOf(store, "Organization")).toBe(1);
    expect(store[0]).toMatchObject({ name: "Demo Surgery Center (synthetic)", meta: { tag: [{ code: "synthetic" }] } });
  });
});

describe("seedPractitioners", () => {
  const roleKeys = staffRoleKeys(ROLE_TEMPLATES);

  it("covers every staff role template and none for the patient portal role", () => {
    expect(roleKeys).not.toContain("patient");
    expect(roleKeys).toEqual(expect.arrayContaining(["front-desk", "rn", "gi-physician", "admin", "auditor"]));
    expect(roleKeys).toHaveLength(ROLE_TEMPLATES.length - 1);
  });

  it("creates one practitioner per role and no duplicates on a second run", async () => {
    const { medplum, store } = fakeMedplum();
    const first = await seedPractitioners(medplum, roleKeys);
    const second = await seedPractitioners(medplum, roleKeys);
    expect(second).toEqual(first);
    expect(Object.keys(first)).toEqual(roleKeys);
    expect(countOf(store, "Practitioner")).toBe(roleKeys.length);
    expect(new Set(Object.values(first)).size).toBe(roleKeys.length);
  });

  it("uses synthetic data only: obvious names, no dates of birth, contact details or addresses", async () => {
    const { medplum, store } = fakeMedplum();
    await seedPractitioners(medplum, roleKeys);
    await seedFacility(medplum);
    for (const resource of store) {
      expect(resource).not.toHaveProperty("birthDate");
      expect(resource).not.toHaveProperty("telecom");
      expect(resource).not.toHaveProperty("address");
      expect(resource).toMatchObject({ meta: { tag: [{ system: "urn:asc-ehr:seed", code: "synthetic" }] } });
    }
    for (const practitioner of store.filter((resource) => resource.resourceType === "Practitioner")) {
      const [name] = practitioner.name as { given: string[]; family: string }[];
      expect(name?.given).toEqual(["Synthetic"]);
      expect(name?.family).toMatch(/^Demo-/);
    }
  });
});

describe("stringField", () => {
  it("reads a string property and ignores everything else", () => {
    expect(stringField({ code: "abc" }, "code")).toBe("abc");
    expect(stringField({ code: 1 }, "code")).toBeUndefined();
    expect(stringField(null, "code")).toBeUndefined();
    expect(stringField("code", "code")).toBeUndefined();
  });
});
