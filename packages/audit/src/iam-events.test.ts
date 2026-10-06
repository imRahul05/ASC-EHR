import { describe, expect, it } from "vitest";

import { AuditClient, IamDetailsError, IAM_ACTIONS, iamEvent, isIamAction } from "./index.js";
import type { AuditEvent, AuditStore } from "./index.js";

const events: AuditEvent[] = [];
const store: AuditStore = {
  durable: true,
  save(event) {
    events.push(event);
    return Promise.resolve();
  },
};
const dev = new AuditClient(store, { production: false });
const prod = new AuditClient(store, { production: true });
const actor = { actorType: "user", actorId: "u-1", membershipId: "m-1", tenantId: "t-1", outcome: "SUCCESS" } as const;

describe("IAM event vocabulary", () => {
  it("names the P05f events", () => {
    expect([...IAM_ACTIONS]).toEqual(
      expect.arrayContaining(["auth.login", "auth.logout", "auth.denied", "user.invited"]),
    );
    expect(IAM_ACTIONS.filter((a) => a.startsWith("membership."))).not.toHaveLength(0);
    expect(IAM_ACTIONS.filter((a) => a.startsWith("role."))).not.toHaveLength(0);
    expect(isIamAction("role.assigned")).toBe(true);
    expect(isIamAction("case.read")).toBe(false);
  });

  it("builds typed events and stores their details unchanged", async () => {
    events.length = 0;
    await dev.logEvent(iamEvent("auth.login", actor, { mfa: true }));
    await dev.logEvent(
      iamEvent("role.assigned", actor, { targetMembershipId: "m-2", roleKey: "rn", roleVersion: "rn-v3", targetFacilityId: "f-1" }),
    );
    await dev.logEvent(iamEvent("user.invited", actor, { inviteId: "inv-1" }));
    expect(events.map((e) => e.action)).toEqual(["auth.login", "role.assigned", "user.invited"]);
    expect(events[1]?.details).toEqual({ targetMembershipId: "m-2", roleKey: "rn", roleVersion: "rn-v3", targetFacilityId: "f-1" });
    expect(events[2]?.details).toEqual({ inviteId: "inv-1" });
  });

  it("auth.denied is always DENIED and carries the gate and decision", async () => {
    events.length = 0;
    await dev.logEvent(
      iamEvent(
        "auth.denied",
        { ...actor, gate: 3, decision: { roleVersions: ["rn-v3"], catalogVersion: "3b350a5", cache: "miss" } },
        { reason: "wrong-facility", capability: "case.read" },
      ),
    );
    expect(events[0]).toMatchObject({
      action: "auth.denied",
      outcome: "DENIED",
      gate: 3,
      details: { reason: "wrong-facility", capability: "case.read" },
      decision: { cache: "miss" },
    });
  });

  it("rejects an email or a name where an id belongs, outside production", async () => {
    events.length = 0;
    await expect(dev.logEvent(iamEvent("user.invited", actor, { inviteId: "jane.doe@example.test" }))).rejects.toBeInstanceOf(
      IamDetailsError,
    );
    await expect(
      dev.logEvent(iamEvent("role.assigned", actor, { targetMembershipId: "Jane Doe", roleKey: "rn", roleVersion: "rn-v3" })),
    ).rejects.toThrow(/targetMembershipId/);
    expect(events).toHaveLength(0);
  });

  it("drops an offending value in production, keeps the event and marks it", async () => {
    events.length = 0;
    await prod.logEvent(iamEvent("user.invited", actor, { inviteId: "jane.doe@example.test", targetMembershipId: "m-9" }));
    expect(events[0]?.details).toEqual({ targetMembershipId: "m-9" });
    expect(events[0]?.detailsRedacted).toBe(true);
    expect(JSON.stringify(events[0])).not.toContain("jane.doe");
  });

  it("still applies the PHI key rules to IAM events", async () => {
    await expect(
      dev.logEvent({ ...actor, action: "auth.login", details: { email: "a@b.test" } }),
    ).rejects.toThrow(/email/);
  });

  it("does not apply the id rule to non-IAM events", async () => {
    events.length = 0;
    await dev.logEvent({ ...actor, action: "PATIENT_READ", details: { reason: "chart review" } });
    expect(events[0]?.details).toEqual({ reason: "chart review" });
  });
});
