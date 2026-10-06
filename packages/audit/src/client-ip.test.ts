import { describe, expect, it } from "vitest";

import { AuditClient, MAX_USER_AGENT_LENGTH } from "./index.js";
import type { AuditEvent, AuditStore } from "./index.js";
import { truncateClientIp } from "./client-ip.js";

describe("truncateClientIp", () => {
  it("keeps the /24 of an IPv4 address", () => {
    expect(truncateClientIp("203.0.113.57")).toBe("203.0.113.0/24");
  });

  it("keeps the /48 of an IPv6 address, including compressed forms", () => {
    expect(truncateClientIp("2001:db8:1:2:3:4:5:6")).toBe("2001:db8:1::/48");
    expect(truncateClientIp("2001:DB8:abcd::1")).toBe("2001:db8:abcd::/48");
    expect(truncateClientIp("::1")).toBe("0:0:0::/48");
  });

  it("treats an IPv4-mapped IPv6 address as IPv4 and ignores a zone id", () => {
    expect(truncateClientIp("::ffff:203.0.113.57")).toBe("203.0.113.0/24");
    expect(truncateClientIp("fe80::1%eth0")).toBe("fe80:0:0::/48");
  });

  it("returns undefined for anything that is not an IP address", () => {
    for (const bad of ["", "not-an-ip", "203.0.113", "1.2.3.4.5", "2001:db8::1::2", "user@example.test"]) {
      expect(truncateClientIp(bad)).toBeUndefined();
    }
  });

  it("never contains the host part of the address", () => {
    expect(truncateClientIp("203.0.113.57")).not.toContain("57");
    expect(truncateClientIp("2001:db8:1:2:3:4:5:6")).not.toContain("5:6");
  });
});

describe("AuditClient client address handling", () => {
  const events: AuditEvent[] = [];
  const store: AuditStore = {
    durable: true,
    save(event) {
      events.push(event);
      return Promise.resolve();
    },
  };
  const base = { action: "auth.login", actorType: "user", actorId: "u-1", outcome: "SUCCESS" } as const;

  it("stores only the prefix and never the raw address", async () => {
    events.length = 0;
    await new AuditClient(store, { production: false }).logEvent({ ...base, clientIp: "203.0.113.57" });
    expect(events[0]?.clientIpPrefix).toBe("203.0.113.0/24");
    expect(JSON.stringify(events[0])).not.toContain("203.0.113.57");
    expect(events[0]).not.toHaveProperty("clientIp");
  });

  it("drops an unparseable address instead of storing or echoing it", async () => {
    events.length = 0;
    await new AuditClient(store, { production: false }).logEvent({ ...base, clientIp: "someone@example.test" });
    expect(events[0]).not.toHaveProperty("clientIpPrefix");
    expect(JSON.stringify(events[0])).not.toContain("someone");
  });

  it("cuts the user agent to the maximum length", async () => {
    events.length = 0;
    await new AuditClient(store, { production: false }).logEvent({ ...base, userAgent: "x".repeat(500) });
    expect(events[0]?.userAgent).toHaveLength(MAX_USER_AGENT_LENGTH);
  });
});
