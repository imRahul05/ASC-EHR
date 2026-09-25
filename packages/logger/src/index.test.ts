import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";

import {
  buildLogger,
  buildLoggerOptions,
  buildRedactPaths,
  isSensitiveKey,
  loggerOptions,
  resolveLogLevel,
  SENSITIVE_KEYS,
} from "./index.js";
import type { Logger } from "./index.js";

const R = "[REDACTED]";

function capture(): { log: Logger; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  const log = buildLogger(buildLoggerOptions({ NODE_ENV: "test", LOG_LEVEL: "trace" }), stream);
  return {
    log,
    lines: () =>
      chunks
        .join("")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

function logOne(obj: Record<string, unknown>): Record<string, unknown> {
  const { log, lines } = capture();
  log.info(obj, "test");
  const [line] = lines();
  if (!line) throw new Error("no log line written");
  return line;
}

describe("redaction", () => {
  it("redacts sensitive keys at the top level", () => {
    const line = logOne({ dob: "1970-01-01", password: "p", prompt: "hi" });
    expect(line).toMatchObject({ dob: R, password: R, prompt: R });
  });

  it("redacts nested keys at depths 1-4", () => {
    const line = logOne({
      patient: { dob: "1970-01-01" },
      resource: { name: { birthDate: "1970-01-01" } },
      req: { body: { patient: { ssn: "123-45-6789" } } },
      a: { b: { c: { d: { email: "x@y.z" } } } },
    });
    expect(line).toMatchObject({
      patient: { dob: R },
      resource: { name: { birthDate: R } },
      req: { body: { patient: { ssn: R } } },
      a: { b: { c: { d: { email: R } } } },
    });
    expect(JSON.stringify(line)).not.toMatch(/1970|123-45|x@y\.z/);
  });

  it("redacts inside arrays (FHIR-style)", () => {
    const line = logOne({
      resource: { telecom: [{ value: "555" }], text: { div: "<div>narrative</div>" } },
      bundle: [{ resource: { address: [{ line: ["1 Main St"] }] } }],
    });
    expect(JSON.stringify(line)).not.toMatch(/555|narrative|Main St/);
  });

  it("redacts hyphenated header keys at any depth", () => {
    const line = logOne({
      req: { headers: { "x-api-key": "k1", authorization: "Bearer t", cookie: "c" } },
      "x-api-key": "k0",
      upstream: { response: { headers: { "set-cookie": "s" } } },
    });
    expect(line).toMatchObject({
      "x-api-key": R,
      req: { headers: { "x-api-key": R, authorization: R, cookie: R } },
      upstream: { response: { headers: { "set-cookie": R } } },
    });
  });

  it("keeps internal resource IDs loggable", () => {
    const line = logOne({
      patientId: "p-1",
      job: { data: { patientId: "p-1", surgicalCaseId: "sc-1", encounterId: "e-1" } },
    });
    expect(line).toMatchObject({
      patientId: "p-1",
      job: { data: { patientId: "p-1", surgicalCaseId: "sc-1", encounterId: "e-1" } },
    });
  });

  it("generates wildcard and bracket paths", () => {
    const paths = buildRedactPaths();
    for (const p of ["dob", "*.dob", "*.*.dob", "*.*.*.dob", "*.*.*.*.dob"]) {
      expect(paths).toContain(p);
    }
    expect(paths).toContain('["x-api-key"]');
    expect(paths).toContain('*["x-api-key"]');
    expect(paths).toContain('req.headers["x-api-key"]');
    expect(paths.some((p) => p.includes("patientId"))).toBe(false);
  });

  it("matches sensitive keys case/punctuation-insensitively", () => {
    expect(SENSITIVE_KEYS).toContain("dob");
    expect(isSensitiveKey("BirthDate")).toBe(true);
    expect(isSensitiveKey("x_api_key")).toBe(true);
    expect(isSensitiveKey("patientId")).toBe(false);
  });
});

describe("serializers", () => {
  it("serializes errors structurally", () => {
    const { log, lines } = capture();
    log.error({ err: new TypeError("boom") }, "failed");
    const err = lines()[0]?.err as Record<string, unknown> | undefined;
    expect(err).toMatchObject({ type: "TypeError", message: "boom" });
    expect(typeof err?.stack).toBe("string");
  });

  it("redacts sensitive props attached to errors", () => {
    const { log, lines } = capture();
    const e = Object.assign(new Error("bad"), { patient: { dob: "1970-01-01" } });
    log.error({ err: e }, "failed");
    expect(JSON.stringify(lines()[0])).not.toContain("1970");
  });
});

describe("options", () => {
  it("falls back to info for an invalid LOG_LEVEL", () => {
    expect(resolveLogLevel("verbose")).toBe("info");
    expect(resolveLogLevel(undefined)).toBe("info");
    expect(resolveLogLevel("DEBUG")).toBe("debug");
    expect(resolveLogLevel("silent")).toBe("silent");
  });

  it("uses pino-pretty only in development", () => {
    expect(buildLoggerOptions({ NODE_ENV: "development" }).transport).toBeDefined();
    expect(buildLoggerOptions({ NODE_ENV: "production" }).transport).toBeUndefined();
    expect(buildLoggerOptions({ NODE_ENV: "test" }).transport).toBeUndefined();
  });

  it("exports loggerOptions with redaction configured", () => {
    expect(loggerOptions.redact).toBeDefined();
  });
});
