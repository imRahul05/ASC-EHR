import { Writable } from "node:stream";
import { buildLogger, buildLoggerOptions } from "@repo/logger";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AuditClient,
  AuditDetailsError,
  AuditStoreNotConfiguredError,
  createAuditClient,
  LoggerAuditStore,
} from "./index.js";
import type { AuditEvent, AuditEventInput, AuditStore } from "./index.js";

class MemoryStore implements AuditStore {
  readonly durable = true;
  events: AuditEvent[] = [];
  save(event: AuditEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}

const base: AuditEventInput = {
  action: "PATIENT_READ",
  actorType: "user",
  actorId: "u-1",
  patientId: "p-1",
  outcome: "SUCCESS",
};

/** Casts deliberately-invalid input past the compile-time checks. */
function unsafe(input: Record<string, unknown>): AuditEventInput {
  return input as unknown as AuditEventInput;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("AuditClient", () => {
  it("adds an ISO timestamp and passes the event to the store", async () => {
    const store = new MemoryStore();
    await new AuditClient(store, { production: false }).logEvent({ ...base, details: { count: 2 } });
    const [event] = store.events;
    expect(event).toMatchObject({ ...base, details: { count: 2 } });
    expect(new Date(event?.timestamp ?? "").toISOString()).toBe(event?.timestamp);
    expect(event?.detailsRedacted).toBeUndefined();
  });

  it("rejects PHI keys in details outside production", async () => {
    const store = new MemoryStore();
    const client = new AuditClient(store, { production: false });
    await expect(client.logEvent({ ...base, details: { dob: "1970-01-01" } })).rejects.toBeInstanceOf(
      AuditDetailsError,
    );
    await expect(client.logEvent({ ...base, details: { X_API_KEY: "k" } })).rejects.toThrow(/X_API_KEY/);
    expect(store.events).toHaveLength(0);
  });

  it("rejects nested details outside production", async () => {
    const client = new AuditClient(new MemoryStore(), { production: false });
    await expect(
      client.logEvent(unsafe({ ...base, details: { patient: { id: "p-1" } } })),
    ).rejects.toBeInstanceOf(AuditDetailsError);
    await expect(client.logEvent(unsafe({ ...base, details: { ids: ["a"] } }))).rejects.toBeInstanceOf(
      AuditDetailsError,
    );
  });

  it("drops PHI and nested details in production and marks the event", async () => {
    const store = new MemoryStore();
    const client = new AuditClient(store, { production: true });
    await client.logEvent(
      unsafe({ ...base, details: { reason: "chart review", email: "x@y.z", nested: { a: 1 } } }),
    );
    const [event] = store.events;
    expect(event?.details).toEqual({ reason: "chart review" });
    expect(event?.detailsRedacted).toBe(true);
    expect(JSON.stringify(event)).not.toContain("x@y.z");
  });

  it("propagates store failures", async () => {
    const failing: AuditStore = {
      durable: true,
      save: () => Promise.reject(new Error("db down")),
    };
    await expect(new AuditClient(failing, { production: false }).logEvent(base)).rejects.toThrow(
      "db down",
    );
  });
});

describe("createAuditClient", () => {
  it("throws in production without a durable store", () => {
    expect(() => createAuditClient(undefined, { production: true })).toThrow(
      AuditStoreNotConfiguredError,
    );
    expect(() => createAuditClient(new LoggerAuditStore(), { production: true })).toThrow(
      AuditStoreNotConfiguredError,
    );
  });

  it("accepts a durable store in production", async () => {
    const store = new MemoryStore();
    await createAuditClient(store, { production: true }).logEvent(base);
    expect(store.events).toHaveLength(1);
  });

  it("falls back to LoggerAuditStore outside production", () => {
    expect(() => createAuditClient(undefined, { production: false })).not.toThrow();
  });
});

describe("default auditClient", () => {
  it("imports without throwing in production but throws on use when unconfigured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const mod = await import("./index.js");
    await expect(mod.auditClient.logEvent(base)).rejects.toBeInstanceOf(
      mod.AuditStoreNotConfiguredError,
    );
  });

  it("sends events to the store injected with configureAuditStore", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const mod = await import("./index.js");
    const store = new MemoryStore();
    mod.configureAuditStore(store);
    await mod.auditClient.logEvent(base);
    expect(store.events).toHaveLength(1);
    expect(store.events[0]).toMatchObject(base);
  });
});

describe("LoggerAuditStore", () => {
  it("writes events on the audit channel at info level", async () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      },
    });
    const log = buildLogger(buildLoggerOptions({ NODE_ENV: "test" }), stream);
    await new AuditClient(new LoggerAuditStore(log), { production: false }).logEvent(base);
    const line = JSON.parse(chunks.join("")) as Record<string, unknown>;
    expect(line).toMatchObject({ level: 30, channel: "audit", auditEvent: base });
  });
});
