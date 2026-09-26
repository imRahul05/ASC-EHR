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
