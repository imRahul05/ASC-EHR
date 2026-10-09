import type { ProjectMembership, Task } from "@medplum/fhirtypes";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type Caller, caller, clientCredentialsToken, liveContext, seedOutput } from "./harness.js";

/**
 * The seeded worker clients, one per facility (`asc-ehr-worker@<facility>`, #60), with their REAL credentials
 * from the seed output. Each membership binds `%facility` of `system-worker-v2` to its facility, so Medplum
 * itself confines a job (and any AI agent tool it runs) to that facility; the worker reaches only the types
 * its jobs touch. There is no API service client any more (#57: the API acts with the signed-in user's token).
 * Needs `pnpm medplum:seed`.
 */
const ctx = liveContext();
const seeded = seedOutput();
const WORKERS = ["worker@facility-demo-1", "worker@facility-demo-2"] as const;
const workers: Record<string, Caller> = {};
const taskIds: string[] = [];
const PATIENT_DATA = ["Patient", "Composition", "Encounter", "Appointment", "Observation", "DocumentReference", "Practitioner"];
const PROTECTED = ["ProjectMembership", "ClientApplication", "Project", "Bot", "Subscription", "User"];

const facilityOf = (key: string) => {
  const facilityId = seeded.clientApplications[key]?.facilityId;
  if (facilityId === undefined) throw new Error(`no seeded ${key} client; run pnpm medplum:seed`);
  return facilityId;
};
const task = (facilityId: string): Task => ({
  resourceType: "Task",
  status: "requested",
  intent: "order",
  description: "policy test",
  meta: { accounts: [{ reference: `Organization/${facilityId}` }] },
});

beforeAll(async () => {
  for (const key of WORKERS) {
    const client = seeded.clientApplications[key];
    if (client?.secret === undefined) throw new Error(`no seeded ${key} client; run pnpm medplum:seed`);
    workers[key] = caller(ctx.baseUrl, await clientCredentialsToken(ctx.baseUrl, client.id, client.secret));
  }
});

afterAll(async () => {
  for (const id of taskIds) await ctx.admin.deleteResource("Task", id);
});

const search = (key: string, type: string) => (workers[key] as Caller).request("GET", `fhir/R4/${type}?_count=1`);
const statuses = async (key: string, types: string[]): Promise<Record<string, number>> =>
  Object.fromEntries(await Promise.all(types.map(async (type): Promise<[string, number]> => [type, (await search(key, type)).status])));

describe("retired clients (#57, #60)", () => {
  it.each(["asc-ehr-api", "asc-ehr-worker"])("%s no longer exists", async (name) => {
    expect(await ctx.admin.searchResources("ClientApplication", { "name:exact": name })).toHaveLength(0);
  });
});

describe("the seeded worker memberships", () => {
  it.each(WORKERS)("%s holds exactly one access entry bound to its own facility and is not an admin", async (key) => {
    const client = seeded.clientApplications[key];
    const [membership] = await ctx.admin.searchResources("ProjectMembership", { user: `ClientApplication/${client?.id}` });
    expect(membership?.admin).not.toBe(true);
    expect(membership?.access).toHaveLength(1);
    expect(membership?.access?.[0]?.parameter).toEqual([{ name: "facility", valueReference: { reference: `Organization/${facilityOf(key)}` } }]);
  });
});

describe.each([
  [WORKERS[0], WORKERS[1]],
  [WORKERS[1], WORKERS[0]],
])("%s (other facility: %s)", (own, other) => {
  it("creates, reads and updates its own facility's Tasks", async () => {
    const worker = workers[own] as Caller;
    const created = await worker.request("POST", "fhir/R4/Task", task(facilityOf(own)));
    expect(created.status).toBe(201);
    const id = (created.body as Task).id ?? "";
    taskIds.push(id);
    expect((await worker.request("GET", `fhir/R4/Task/${id}`)).status).toBe(200);
    expect((await worker.request("PUT", `fhir/R4/Task/${id}`, { ...(created.body as Task), ...task(facilityOf(own)), status: "completed" })).status).toBe(200);
  });

  it("cannot see the other facility's Task: a read is 404 and a search leaves it out", async () => {
    const theirs = await ctx.admin.createResource(task(facilityOf(other)));
    taskIds.push(theirs.id ?? "");
    const worker = workers[own] as Caller;
    expect((await worker.request("GET", `fhir/R4/Task/${theirs.id}`)).status).toBe(404);
    const found = (await worker.request("GET", `fhir/R4/Task?_id=${theirs.id}`)).body as { entry?: unknown[] };
    expect(found.entry ?? []).toHaveLength(0);
  });

  it("cannot create a Task at the other facility or move its own Task there (403)", async () => {
    const worker = workers[own] as Caller;
    expect((await worker.request("POST", "fhir/R4/Task", task(facilityOf(other)))).status).toBe(403);
    const mine = await worker.request("POST", "fhir/R4/Task", task(facilityOf(own)));
    taskIds.push((mine.body as Task).id ?? "");
    expect((await worker.request("PUT", `fhir/R4/Task/${(mine.body as Task).id}`, { ...(mine.body as Task), ...task(facilityOf(other)) })).status).toBe(403);
  });

  it("reaches no other type: no patient data, no directory, no policies, no project administration", async () => {
    const types = [...PATIENT_DATA, "PractitionerRole", "Organization", "AccessPolicy", ...PROTECTED];
    expect(await statuses(own, types)).toEqual(Object.fromEntries(types.map((type) => [type, 403])));
  });

  it("cannot read a Binary, create a policy or create a membership to widen itself", async () => {
    const worker = workers[own] as Caller;
    expect((await worker.request("GET", "fhir/R4/Binary/00000000-0000-4000-8000-000000000000")).status).toBe(403);
    expect((await worker.request("POST", "fhir/R4/AccessPolicy", { resourceType: "AccessPolicy", name: "x", resource: [{ resourceType: "Patient" }] })).status).toBe(403);
    const membership: ProjectMembership = { resourceType: "ProjectMembership", project: { reference: `Project/${ctx.projectId}` }, user: { reference: "User/x" }, profile: { reference: "Practitioner/x" } };
    expect((await worker.request("POST", "fhir/R4/ProjectMembership", membership)).status).toBe(403);
  });
});
