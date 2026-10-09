import { MockClient } from "@medplum/mock";
import type { Bundle, Task } from "@medplum/fhirtypes";
import { describe, expect, it, vi } from "vitest";

import { forFacility } from "./facility";

const A = { reference: "Organization/fac-a" };
const task = (extra: Partial<Task> = {}): Task => ({ resourceType: "Task", status: "requested", intent: "order", ...extra });

describe("forFacility", () => {
  it("stamps the facility on create, and the stored resource carries it", async () => {
    const writer = forFacility(new MockClient(), "fac-a");
    const created = await writer.create(task());
    expect(created.meta?.accounts).toEqual([A]);
  });

  it("re-stamps a read-modify-write of a resource read without its accounts (decision 1)", async () => {
    const client = new MockClient();
    const writer = forFacility(client, "fac-a");
    const created = await writer.create(task());
    const asReadOverHttp = { ...created, meta: { versionId: created.meta?.versionId, lastUpdated: created.meta?.lastUpdated }, status: "completed" as const };
    const spy = vi.spyOn(client, "updateResource");
    await writer.update(asReadOverHttp);
    expect(spy.mock.calls[0]?.[0].meta?.accounts).toEqual([A]);
    expect(spy.mock.calls[0]?.[0].meta?.versionId).toBe(created.meta?.versionId);
  });

  it("refuses a body that names another facility, two facilities or the deprecated singular field, before any call", () => {
    const client = new MockClient();
    const spy = vi.spyOn(client, "createResource");
    const writer = forFacility(client, "fac-a");
    expect(() => writer.create(task({ meta: { accounts: [{ reference: "Organization/fac-b" }] } }))).toThrow("Task names another facility");
    expect(() => writer.create(task({ meta: { accounts: [A, { reference: "Organization/fac-b" }] } }))).toThrow("names another facility");
    expect(() => writer.update(task({ id: "t1", meta: { account: A } }))).toThrow("deprecated meta.account");
    expect(spy).not.toHaveBeenCalled();
  });

  it("refuses directory types: they are shared, never facility-scoped", () => {
    const writer = forFacility(new MockClient(), "fac-a");
    expect(() => writer.create({ resourceType: "PractitionerRole" })).toThrow("PractitionerRole is directory data");
    expect(() => writer.patch("Organization", "o1", [])).toThrow("Organization is directory data");
  });

  it("appends the facility to every patch and refuses a patch that touches meta", () => {
    const client = new MockClient();
    const spy = vi.spyOn(client, "patchResource").mockResolvedValue(task({ id: "t1" }) as never);
    const writer = forFacility(client, "fac-a");
    void writer.patch("Task", "t1", [{ op: "replace", path: "/status", value: "completed" }]);
    expect(spy).toHaveBeenCalledWith("Task", "t1", [
      { op: "replace", path: "/status", value: "completed" },
      { op: "add", path: "/meta/accounts", value: [A] },
    ]);
    expect(() => writer.patch("Task", "t1", [{ op: "replace", path: "/meta/accounts/0/reference", value: "Organization/fac-b" }])).toThrow("may not change meta");
  });

  it("stamps every POST and PUT entry of a transaction and refuses other bundles and methods", () => {
    const client = new MockClient();
    const spy = vi.spyOn(client, "executeBatch").mockResolvedValue({ resourceType: "Bundle", type: "transaction-response" });
    const writer = forFacility(client, "fac-a");
    const bundle: Bundle = {
      resourceType: "Bundle",
      type: "transaction",
      entry: [
        { resource: task(), request: { method: "POST", url: "Task" } },
        { resource: task({ id: "t2" }), request: { method: "PUT", url: "Task/t2" } },
        { request: { method: "GET", url: "Task/t3" } },
      ],
    };
    void writer.transaction(bundle);
    const sent = spy.mock.calls[0]?.[0];
    expect(sent?.entry?.slice(0, 2).map((entry) => entry.resource?.meta?.accounts)).toEqual([[A], [A]]);
    expect(sent?.entry?.[2]).toEqual(bundle.entry?.[2]);
    expect(() => writer.transaction({ resourceType: "Bundle", type: "batch" })).toThrow("only a transaction");
    expect(() => writer.transaction({ resourceType: "Bundle", type: "transaction", entry: [{ request: { method: "PATCH", url: "Task/t1" } }] })).toThrow(
      "may only POST, PUT, GET or DELETE",
    );
  });

  it("refuses a facility id that is not a FHIR id", () => {
    expect(() => forFacility(new MockClient(), "fac a/../b")).toThrow("invalid facility id");
  });
});
