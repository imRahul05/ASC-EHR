import { describe, expect, it } from "vitest";

import { AuditClient, AuditDecisionError } from "./index.js";
import type { AuditDecision, AuditEvent, AuditEventInput, AuditStore } from "./index.js";

const events: AuditEvent[] = [];
const store: AuditStore = {
  durable: true,
  save(event) {
    events.push(event);
    return Promise.resolve();
  },
};

const decision: AuditDecision = { roleVersions: ["rn-v3", "clinical-supervisor-v1"], catalogVersion: "3b350a5", cache: "bypass" };
const base: AuditEventInput = { action: "case.read", actorType: "user", actorId: "u-1", outcome: "DENIED", gate: 4 };

describe("decision provenance", () => {
  it("passes role versions, catalog version and cache state to the store", async () => {
    events.length = 0;
    await new AuditClient(store, { production: false }).logEvent({ ...base, decision });
    expect(events[0]).toMatchObject({ gate: 4, decision });
  });

  it("copies the decision so later mutation of the input cannot change the stored event", async () => {
    events.length = 0;
    const versions = ["rn-v3"];
    await new AuditClient(store, { production: false }).logEvent({
      ...base,
      decision: { ...decision, roleVersions: versions },
    });
    versions.push("tampered");
    expect(events[0]?.decision?.roleVersions).toEqual(["rn-v3"]);
  });

  it("rejects free text in a decision outside production", async () => {
    const client = new AuditClient(store, { production: false });
    await expect(client.logEvent({ ...base, decision: { ...decision, roleVersions: ["Jane Doe, RN"] } })).rejects.toBeInstanceOf(
      AuditDecisionError,
    );
    await expect(client.logEvent({ ...base, decision: { ...decision, catalogVersion: "x".repeat(65) } })).rejects.toBeInstanceOf(
      AuditDecisionError,
    );
  });

  it("rejects a cache state that is not hit, miss or bypass", async () => {
    const client = new AuditClient(store, { production: false });
    const forged = { ...decision, cache: "Jane Doe was here" as never };
    await expect(client.logEvent({ ...base, decision: forged })).rejects.toBeInstanceOf(AuditDecisionError);
    await expect(client.logEvent({ ...base, decision: { ...decision, cache: "" as never } })).rejects.toBeInstanceOf(
      AuditDecisionError,
    );
  });

  it("accepts each valid cache state", async () => {
    events.length = 0;
    const client = new AuditClient(store, { production: false });
    for (const cache of ["hit", "miss", "bypass"] as const) await client.logEvent({ ...base, decision: { ...decision, cache } });
    expect(events.map((e) => e.decision?.cache)).toEqual(["hit", "miss", "bypass"]);
  });

  it("drops a decision with a free-text cache state in production and marks the event", async () => {
    events.length = 0;
    await new AuditClient(store, { production: true }).logEvent({
      ...base,
      decision: { ...decision, cache: "Jane Doe was here" as never },
    });
    expect(events[0]).not.toHaveProperty("decision");
    expect(events[0]?.detailsRedacted).toBe(true);
    expect(JSON.stringify(events[0])).not.toContain("Jane");
  });

  it("drops an invalid decision in production, keeps the event and marks it", async () => {
    events.length = 0;
    await new AuditClient(store, { production: true }).logEvent({
      ...base,
      decision: { ...decision, roleVersions: ["Jane Doe, RN"] },
    });
    expect(events[0]).not.toHaveProperty("decision");
    expect(events[0]?.detailsRedacted).toBe(true);
    expect(JSON.stringify(events[0])).not.toContain("Jane");
  });
});
