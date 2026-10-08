import type { ProjectMembership, Task } from "@medplum/fhirtypes";
import { beforeAll, describe, expect, it } from "vitest";

import { type Caller, caller, clientCredentialsToken, liveContext, seedOutput } from "./harness.js";

/**
 * The seeded `asc-ehr-api` and `asc-ehr-worker` clients, with their REAL credentials from the seed output:
 * least privilege, not the full project access they had before P05h. The API acts for a signed-in user with
 * that user's token, so its own identity reads only the role directory; the worker reaches only the types its
 * jobs touch. Needs `pnpm medplum:seed`.
 */
const ctx = liveContext();
const seeded = seedOutput();
const clients: Record<string, Caller> = {};
const PATIENT_DATA = ["Patient", "Composition", "Encounter", "Appointment", "Observation", "DocumentReference", "Practitioner"];
const PROTECTED = ["ProjectMembership", "ClientApplication", "Project", "Bot", "Subscription", "User"];

async function clientOf(key: string): Promise<Caller> {
  const client = seeded.clientApplications[key];
  if (client?.secret === undefined) throw new Error(`no seeded ${key} client; run pnpm medplum:seed`);
  return caller(ctx.baseUrl, await clientCredentialsToken(ctx.baseUrl, client.id, client.secret));
}

beforeAll(async () => {
  clients.api = await clientOf("api");
  clients.worker = await clientOf("worker");
});

const search = (key: string, type: string) => (clients[key] as Caller).request("GET", `fhir/R4/${type}?_count=1`);
const statuses = async (key: string, types: string[]): Promise<Record<string, number>> =>
  Object.fromEntries(await Promise.all(types.map(async (type): Promise<[string, number]> => [type, (await search(key, type)).status])));

describe("documents and attachments (Binary has no search, so it is read directly)", () => {
  it.each(["api", "worker"])("%s cannot read a Binary", async (key) => {
    expect(((await (clients[key] as Caller).request("GET", "fhir/R4/Binary/00000000-0000-4000-8000-000000000000")).status)).toBe(403);
  });
});

describe("the seeded memberships", () => {
  it.each(["api", "worker"])("%s holds exactly one narrow access entry and is not an admin", async (key) => {
    const client = seeded.clientApplications[key];
    const [membership] = await ctx.admin.searchResources("ProjectMembership", { user: `ClientApplication/${client?.id}` });
    expect(membership?.admin).not.toBe(true);
    expect(membership?.access).toHaveLength(1);
  });
});

describe("asc-ehr-api (service identity)", () => {
  it("reads the role directory: PractitionerRole, AccessPolicy and facility names", async () => {
    expect(await statuses("api", ["PractitionerRole", "AccessPolicy", "Organization"])).toEqual({ PractitionerRole: 200, AccessPolicy: 200, Organization: 200 });
  });

  it("reads no patient or clinical data: that needs the signed-in user's token", async () => {
    const denied = Object.fromEntries(PATIENT_DATA.map((type) => [type, 403]));
    expect(await statuses("api", PATIENT_DATA)).toEqual(denied);
  });

  it("cannot reach project administration types", async () => {
    expect(await statuses("api", PROTECTED)).toEqual(Object.fromEntries(PROTECTED.map((type) => [type, 403])));
  });

  it("writes nothing, not even the directory it can read", async () => {
    const [role] = ((await search("api", "PractitionerRole")).body as { entry?: { resource: { id: string } }[] }).entry ?? [];
    expect((await (clients.api as Caller).request("PUT", `fhir/R4/PractitionerRole/${role?.resource.id}`, { ...role?.resource, active: false })).status).toBe(403);
    expect((await (clients.api as Caller).request("POST", "fhir/R4/Organization", { resourceType: "Organization", name: "x" })).status).toBe(403);
    expect((await (clients.api as Caller).request("POST", "fhir/R4/AccessPolicy", { resourceType: "AccessPolicy", name: "x", resource: [{ resourceType: "Patient" }] })).status).toBe(403);
  });
});

describe("asc-ehr-worker (system-worker)", () => {
  it("creates, reads and updates worklist Tasks", async () => {
    const worker = clients.worker as Caller;
    const created = await worker.request("POST", "fhir/R4/Task", { resourceType: "Task", status: "requested", intent: "order", description: "policy test" } satisfies Task);
    expect(created.status).toBe(201);
    const id = (created.body as Task).id ?? "";
    try {
      expect((await worker.request("GET", `fhir/R4/Task/${id}`)).status).toBe(200);
      expect((await worker.request("PUT", `fhir/R4/Task/${id}`, { ...(created.body as Task), status: "completed" })).status).toBe(200);
    } finally {
      await ctx.admin.deleteResource("Task", id);
    }
  });

  it("reaches no other type: no patient data, no directory, no policies, no project administration", async () => {
    const types = [...PATIENT_DATA, "PractitionerRole", "Organization", "AccessPolicy", ...PROTECTED];
    expect(await statuses("worker", types)).toEqual(Object.fromEntries(types.map((type) => [type, 403])));
  });

  it("cannot create a policy or a membership to widen itself", async () => {
    const worker = clients.worker as Caller;
    expect((await worker.request("POST", "fhir/R4/AccessPolicy", { resourceType: "AccessPolicy", name: "x", resource: [{ resourceType: "Patient" }] })).status).toBe(403);
    const membership: ProjectMembership = { resourceType: "ProjectMembership", project: { reference: `Project/${ctx.projectId}` }, user: { reference: "User/x" }, profile: { reference: "Practitioner/x" } };
    expect((await worker.request("POST", "fhir/R4/ProjectMembership", membership)).status).toBe(403);
  });
});
