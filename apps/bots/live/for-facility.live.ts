import { createOnBehalfClient, forFacility } from "@asc/api-client/server";
import type { Task } from "@medplum/fhirtypes";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { caller, clientCredentialsToken, liveContext, seedOutput } from "./harness.js";

/**
 * P04 T5 against the real server: `forFacility` keeps `meta.accounts` on every write, including a
 * read-modify-write of a body read over plain HTTP (which has no accounts) and a JSON patch. Uses the facility-A
 * worker's token (client credentials do not count against the login throttle).
 */
const ctx = liveContext();
const seeded = seedOutput();
const created: string[] = [];
let token = "";
let facilityId = "";

beforeAll(async () => {
  const worker = seeded.clientApplications["worker@facility-demo-1"];
  if (worker?.secret === undefined || worker.facilityId === undefined) throw new Error("no seeded worker; run pnpm medplum:seed");
  facilityId = worker.facilityId;
  token = await clientCredentialsToken(ctx.baseUrl, worker.id, worker.secret);
});

afterAll(async () => {
  for (const id of created) await ctx.admin.deleteResource("Task", id);
});

describe("forFacility against Medplum 5.1.42", () => {
  it("creates, read-modify-writes and patches with the facility kept every time", async () => {
    const writer = forFacility(createOnBehalfClient({ baseUrl: ctx.baseUrl, accessToken: token }), facilityId);
    const task = await writer.create<Task>({ resourceType: "Task", status: "requested", intent: "order", description: "forFacility live test" });
    created.push(task.id);

    // A plain HTTP read returns meta without the accounts; writing it back raw would be refused (decision 1).
    const asRead = (await caller(ctx.baseUrl, token).request("GET", `fhir/R4/Task/${task.id}`)).body as Task;
    expect(asRead.meta?.accounts).toBeUndefined();
    const updated = await writer.update({ ...asRead, status: "in-progress" });
    expect(updated.status).toBe("in-progress");

    const patched = await writer.patch("Task", task.id, [{ op: "replace", path: "/status", value: "completed" }]);
    expect(patched.status).toBe("completed");

    const stored = await ctx.admin.readResource("Task", task.id);
    expect(stored.meta?.accounts).toEqual([{ reference: `Organization/${facilityId}` }]);
  });
});
