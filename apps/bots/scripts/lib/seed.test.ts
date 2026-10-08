import { readFileSync } from "node:fs";
import { ROLE_TEMPLATES } from "@asc/authz";
import { describe, expect, it } from "vitest";

import {
  ensureProject,
  parseClientAppDefinitions,
  seedClientApplications,
  seedFacility,
  seedPractitioners,
  staffRoleKeys,
  stringField,
} from "./seed.js";
import { fakeMedplum, type Resource } from "./fake-medplum.js";

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

describe("client application definitions", () => {
  const real = JSON.parse(readFileSync(new URL("../../../../infra/medplum/client-apps.json", import.meta.url), "utf8")) as unknown;

  it("accepts the shipped infra/medplum/client-apps.json: a PKCE web app and two confidential apps", () => {
    const definitions = parseClientAppDefinitions(real);
    expect(definitions.map((definition) => definition.key)).toEqual(["web", "api", "worker"]);
    const web = definitions.find((definition) => definition.key === "web");
    expect(web).toMatchObject({ redirectUri: "http://localhost:3000/signin/callback", secret: false, membership: false });
    for (const key of ["api", "worker"]) {
      expect(definitions.find((definition) => definition.key === key)).toMatchObject({ secret: true, membership: true });
    }
    // Any client with a membership must name a policy, or it would have full project access.
    expect(definitions.filter((definition) => definition.membership).every((definition) => definition.policy !== undefined)).toBe(true);
  });

  it("rejects a malformed definition file", () => {
    expect(() => parseClientAppDefinitions({})).toThrow("non-empty clientApplications");
    expect(() => parseClientAppDefinitions({ clientApplications: [] })).toThrow("non-empty clientApplications");
    expect(() => parseClientAppDefinitions({ clientApplications: [{ key: "a", description: "d", secret: true, membership: true }] })).toThrow('"name"');
    expect(() =>
      parseClientAppDefinitions({ clientApplications: [{ key: "a", name: "n", description: "d", secret: "yes", membership: true }] }),
    ).toThrow('"secret" boolean');
  });
});

describe("seedClientApplications", () => {
  const policyIds = { "api-service-v1": "policy-api", "system-worker-v1": "policy-worker" };
  const definitions = parseClientAppDefinitions(
    JSON.parse(readFileSync(new URL("../../../../infra/medplum/client-apps.json", import.meta.url), "utf8")),
  );
  const counter = () => {
    let n = 0;
    const secrets: string[] = [];
    return { secretFor: () => (secrets[secrets.length] = `secret-${++n}`), secrets };
  };

  it("gives confidential clients a secret and a membership, and the public web client neither", async () => {
    const { medplum, store } = fakeMedplum();
    const { secretFor, secrets } = counter();
    const apps = await seedClientApplications(medplum, "project-1", definitions, policyIds, secretFor);
    expect(apps.web).toEqual({ id: expect.any(String) });
    expect(apps.api?.secret).toBe(secrets[0]);
    expect(apps.worker?.secret).toBe(secrets[1]);
    expect(secrets[0]).not.toBe(secrets[1]);
    const memberships = store.filter((resource) => resource.resourceType === "ProjectMembership");
    expect(memberships.map((m) => (m.user as { reference: string }).reference).sort()).toEqual(
      [`ClientApplication/${apps.api?.id}`, `ClientApplication/${apps.worker?.id}`].sort(),
    );
    expect(memberships.every((m) => (m.project as { reference: string }).reference === "Project/project-1")).toBe(true);
    expect(store.find((r) => r.name === "asc-ehr-web")).toMatchObject({ pkceOptional: false });
  });

  it("gives each membership its narrow service policy, never a full-access client", async () => {
    const { medplum, store } = fakeMedplum();
    const apps = await seedClientApplications(medplum, "project-1", definitions, policyIds);
    const accessOf = (clientId: string | undefined) =>
      store.find((r) => r.resourceType === "ProjectMembership" && (r.user as { reference: string }).reference === `ClientApplication/${clientId}`)?.access;
    expect(accessOf(apps.api?.id)).toEqual([{ policy: { reference: "AccessPolicy/policy-api" } }]);
    expect(accessOf(apps.worker?.id)).toEqual([{ policy: { reference: "AccessPolicy/policy-worker" } }]);
  });

  it("refuses a client with a membership and no policy, or a policy that was not seeded", async () => {
    const { medplum } = fakeMedplum();
    const withoutPolicy = definitions.map(({ policy: _policy, ...rest }) => rest);
    await expect(seedClientApplications(medplum, "project-1", withoutPolicy, policyIds)).rejects.toThrow("refusing to create a full-access client");
    await expect(seedClientApplications(medplum, "project-1", definitions, {})).rejects.toThrow("was not seeded");
  });

  it("narrows a membership that was created before and has no access list (full project access)", async () => {
    const { medplum, store } = fakeMedplum([
      { resourceType: "ClientApplication", id: "app-api", name: "asc-ehr-api", description: "old", secret: "kept" },
      { resourceType: "ProjectMembership", id: "m-api", user: { reference: "ClientApplication/app-api" } },
    ]);
    await seedClientApplications(medplum, "project-1", definitions, policyIds);
    expect(store.find((r) => r.id === "m-api")?.access).toEqual([{ policy: { reference: "AccessPolicy/policy-api" } }]);
    expect(store.filter((r) => r.resourceType === "ProjectMembership" && (r.user as { reference: string }).reference === "ClientApplication/app-api")).toHaveLength(1);
  });

  it("changes nothing on a second run: same ids, same secrets, no new memberships", async () => {
    const { medplum, store } = fakeMedplum();
    const { secretFor, secrets } = counter();
    const first = await seedClientApplications(medplum, "project-1", definitions, policyIds, secretFor);
    const sizeAfterFirst = store.length;
    const second = await seedClientApplications(medplum, "project-1", definitions, policyIds, secretFor);
    expect(second).toEqual(first);
    expect(store).toHaveLength(sizeAfterFirst);
    expect(secrets).toHaveLength(2); // generated once per confidential client, never rotated
  });

  it("gives an existing client that has no secret one, and corrects a drifted redirect without touching secrets", async () => {
    const { medplum, store } = fakeMedplum([
      { resourceType: "ClientApplication", id: "app-api", name: "asc-ehr-api", description: "old" },
      { resourceType: "ClientApplication", id: "app-web", name: "asc-ehr-web", redirectUri: "http://localhost:9999/old", pkceOptional: false, description: "old" },
    ]);
    const { secretFor, secrets } = counter();
    const apps = await seedClientApplications(medplum, "project-1", definitions, policyIds, secretFor);
    expect(apps.api).toEqual({ id: "app-api", secret: secrets[0] });
    expect(apps.web?.id).toBe("app-web");
    expect(store.find((r) => r.id === "app-web")).toMatchObject({ redirectUri: "http://localhost:3000/signin/callback" });
    expect(countOf(store, "ClientApplication")).toBe(3);
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
