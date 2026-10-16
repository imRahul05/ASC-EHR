import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkItem } from "@asc/types";
import { claimWorkItem, completeWorkItem, createWorkItem, getWorklist } from "./center";

function stubFetch(response: Response | Error) {
  const fn = vi.fn((_input: string, _init?: RequestInit) =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("worklist client", () => {
  const mockWorkItem: WorkItem = {
    id: "task-1",
    type: "sign_note",
    title: "Sign report",
    detail: "Dr. Smith operative report",
    priority: "urgent",
    status: "open",
    dueAt: "2026-10-16T15:00:00Z",
    createdAt: "2026-10-16T12:00:00Z",
  };

  it("fetches worklist with query and facility header", async () => {
    const fetchMock = stubFetch(Response.json({ items: [mockWorkItem], total: 1 }));
    const res = await getWorklist({ facilityId: "fac-1", status: "open" });
    expect(res).toEqual({ items: [mockWorkItem], total: 1 });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/worklist?facilityId=fac-1&status=open",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-facility-id": "fac-1",
        }),
      }),
    );
  });

  it("creates a work item", async () => {
    const fetchMock = stubFetch(Response.json(mockWorkItem, { status: 201 }));
    const res = await createWorkItem({
      facilityId: "fac-1",
      type: "records_request",
      title: "Request records",
      dueAt: "2026-10-17T12:00:00Z",
    });
    expect(res).toEqual(mockWorkItem);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4000/worklist");
  });

  it("claims a work item by id or payload", async () => {
    const claimedItem: WorkItem = { ...mockWorkItem, status: "claimed" };
    const fetchMock = stubFetch(Response.json(claimedItem));
    const res = await claimWorkItem("task-1", { claimedBy: "user-1" }, "fac-1");
    expect(res.status).toBe("claimed");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4000/worklist/task-1/claim");
  });

  it("completes a work item by id or payload", async () => {
    const completedItem: WorkItem = { ...mockWorkItem, status: "completed" };
    const fetchMock = stubFetch(Response.json(completedItem));
    const res = await completeWorkItem({
      itemId: "task-1",
      payload: { resolution: "Signed off" },
      facilityId: "fac-1",
    });
    expect(res.status).toBe("completed");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4000/worklist/task-1/complete");
  });
});
