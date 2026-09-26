import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  apiEnvSchema,
  EnvValidationError,
  parseEnv,
  workerEnvSchema,
} from "./env.js";
import { DEFAULT_PUBLIC_API_URL, getPublicApiUrl } from "./public-env.js";

describe("parseEnv", () => {
  it("applies api defaults for an empty environment", () => {
    const env = parseEnv(apiEnvSchema, {});
    expect(env).toEqual({
      NODE_ENV: "development",
      PORT: 4000,
      HOST: "0.0.0.0",
      LOG_LEVEL: "info",
    });
  });

  it("applies worker defaults for an empty environment", () => {
    const env = parseEnv(workerEnvSchema, {});
    expect(env.REDIS_URL).toBe("redis://localhost:6379");
    expect(env.INTERACTIVE_CONCURRENCY).toBe(5);
    expect(env.BACKGROUND_CONCURRENCY).toBe(2);
    expect(env.INTERACTIVE_RATE_LIMIT_MAX).toBe(60);
    expect(env.BACKGROUND_RATE_LIMIT_DURATION_MS).toBe(60_000);
    expect(env.NODE_ENV).toBe("development");
  });

  it("coerces numeric values", () => {
    expect(parseEnv(apiEnvSchema, { PORT: "8080" }).PORT).toBe(8080);
  });

  it("lists every invalid variable name in one error without leaking values", () => {
    const secretish = "super-secret-value-123";
    let caught: unknown;
    try {
      parseEnv(apiEnvSchema, {
        PORT: secretish,
        LOG_LEVEL: secretish,
        OTEL_EXPORTER_OTLP_ENDPOINT: secretish,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(EnvValidationError);
    const error = caught as EnvValidationError;
    expect(error.variables).toEqual(
      expect.arrayContaining(["PORT", "LOG_LEVEL", "OTEL_EXPORTER_OTLP_ENDPOINT"]),
    );
    expect(error.message).toContain("PORT (invalid)");
    expect(error.message).toContain("LOG_LEVEL (invalid)");
    expect(error.message).not.toContain(secretish);
  });

  it("accepts an optional postgres DATABASE_URL for api and worker", () => {
    const url = "postgres://asc:asc@localhost:5432/asc_ehr";
    expect(parseEnv(apiEnvSchema, {}).DATABASE_URL).toBeUndefined();
    expect(parseEnv(workerEnvSchema, {}).DATABASE_URL).toBeUndefined();
    expect(parseEnv(apiEnvSchema, { DATABASE_URL: url }).DATABASE_URL).toBe(url);
    expect(
      parseEnv(workerEnvSchema, {
        DATABASE_URL: "postgresql://u:p@db.internal:5432/asc_ehr?sslmode=require",
      }).DATABASE_URL,
    ).toBe("postgresql://u:p@db.internal:5432/asc_ehr?sslmode=require");
  });

  it("rejects a non-postgres DATABASE_URL without echoing it", () => {
    const secretish = "mysql://root:hunter2@db:3306/x";
    expect(() => parseEnv(apiEnvSchema, { DATABASE_URL: secretish })).toThrow(
      "DATABASE_URL (invalid)",
    );
    expect(() => parseEnv(workerEnvSchema, { DATABASE_URL: secretish })).not.toThrow(/hunter2/);
    expect(() => parseEnv(workerEnvSchema, { DATABASE_URL: "not a url" })).toThrow(
      "DATABASE_URL (invalid)",
    );
  });

  it("reports missing required variables by name only", () => {
    const schema = z.object({ DATABASE_URL: z.string().url() });
    expect(() => parseEnv(schema, {})).toThrow("DATABASE_URL (missing)");
    expect(() => parseEnv(schema, { DATABASE_URL: "postgres-password" })).not.toThrow(
      /postgres-password/,
    );
  });
});

describe("getPublicApiUrl", () => {
  it("falls back to the default URL", () => {
    const previous = process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    try {
      expect(getPublicApiUrl()).toBe(DEFAULT_PUBLIC_API_URL);
    } finally {
      if (previous !== undefined) process.env.NEXT_PUBLIC_API_URL = previous;
    }
  });
});
