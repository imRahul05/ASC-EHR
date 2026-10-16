import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnesthesiaEntryPayload } from "@asc/types";
import * as casesModule from "../clinical/cases";
import {
  clearAimsQueue,
  enqueueAimsEntry,
  flushAimsQueue,
  getAimsQueueSize,
  getPendingAimsEntries,
} from "./queue";

describe("AIMS Offline Queue (queue.ts)", () => {
  beforeEach(async () => {
    await clearAimsQueue();
  });

  afterEach(async () => {
    await clearAimsQueue();
    vi.restoreAllMocks();
  });

  const dosePayload: AnesthesiaEntryPayload = {
    kind: "dose",
    drug: "propofol",
    amount: 100,
    unit: "mg",
  };

  const vitalsPayload: AnesthesiaEntryPayload = {
    kind: "vitals",
    vitals: {
      context: "intra",
      hr: 72,
      sbp: 120,
      dbp: 80,
      spo2: 99,
      rr: 16,
      etco2: 36,
      tempC: 36.8,
    },
  };

  it("enqueues entries, tracks queue size, and retrieves them sorted chronologically", async () => {
    const caseId = "case-offline-101";

    const id1 = await enqueueAimsEntry(caseId, dosePayload);
    expect(id1).toBeTruthy();

    const id2 = await enqueueAimsEntry(caseId, vitalsPayload);
    expect(id2).toBeTruthy();

    const size = await getAimsQueueSize(caseId);
    expect(size).toBe(2);

    const pending = await getPendingAimsEntries(caseId);
    expect(pending).toHaveLength(2);
    expect(pending[0]?.clientId).toBe(id1);
    expect(pending[0]?.payload).toEqual(dosePayload);
    expect(pending[1]?.clientId).toBe(id2);
    expect(pending[1]?.payload).toEqual(vitalsPayload);
  });

  it("filters entries by caseId", async () => {
    await enqueueAimsEntry("case-A", dosePayload);
    await enqueueAimsEntry("case-B", vitalsPayload);

    expect(await getAimsQueueSize("case-A")).toBe(1);
    expect(await getAimsQueueSize("case-B")).toBe(1);
    expect(await getAimsQueueSize()).toBe(2);

    const pendingA = await getPendingAimsEntries("case-A");
    expect(pendingA).toHaveLength(1);
    expect(pendingA[0]?.payload.kind).toBe("dose");
  });

  it("flushes pending entries via syncAimsBatch and purges them on success", async () => {
    const caseId = "case-flush-200";
    await enqueueAimsEntry(caseId, dosePayload);
    await enqueueAimsEntry(caseId, vitalsPayload);

    const syncSpy = vi
      .spyOn(casesModule, "syncAimsBatch")
      .mockResolvedValue({ syncedCount: 2, duplicateCount: 0 });

    const result = await flushAimsQueue(caseId, "fac-main");

    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(syncSpy).toHaveBeenCalledWith(
      caseId,
      expect.arrayContaining([
        expect.objectContaining({ caseId, payload: dosePayload }),
        expect.objectContaining({ caseId, payload: vitalsPayload }),
      ]),
      "fac-main",
    );
    expect(result).toEqual({ synced: 2, remaining: 0 });

    const remaining = await getPendingAimsEntries(caseId);
    expect(remaining).toHaveLength(0);
    expect(await getAimsQueueSize(caseId)).toBe(0);
  });

  it("returns zero synced when queue is empty", async () => {
    const result = await flushAimsQueue("case-empty");
    expect(result).toEqual({ synced: 0, remaining: 0 });
  });

  it("retains entries in the queue if sync fails", async () => {
    const caseId = "case-error-300";
    await enqueueAimsEntry(caseId, dosePayload);

    vi.spyOn(casesModule, "syncAimsBatch").mockRejectedValue(new Error("Network offline"));

    await expect(flushAimsQueue(caseId)).rejects.toThrow("Network offline");

    const size = await getAimsQueueSize(caseId);
    expect(size).toBe(1);
  });

  it("clears entries for a specific case", async () => {
    await enqueueAimsEntry("case-X", dosePayload);
    await enqueueAimsEntry("case-Y", vitalsPayload);

    await clearAimsQueue("case-X");

    expect(await getAimsQueueSize("case-X")).toBe(0);
    expect(await getAimsQueueSize("case-Y")).toBe(1);
  });

  it("purges entire queue when clearAimsQueue is called without arguments (HIPAA logout purge)", async () => {
    await enqueueAimsEntry("case-1", dosePayload);
    await enqueueAimsEntry("case-2", vitalsPayload);

    expect(await getAimsQueueSize()).toBe(2);

    await clearAimsQueue();

    expect(await getAimsQueueSize()).toBe(0);
    expect(await getPendingAimsEntries("case-1")).toHaveLength(0);
    expect(await getPendingAimsEntries("case-2")).toHaveLength(0);
  });
});
