import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  apiEnvSchema,
  seedEnvSchema,
  resolveTenantRef,
  DEV_WEB_ORIGIN,
  EnvValidationError,
  parseEnv,
  resolveCorsOrigins,
  workerEnvSchema,
} from "./env.js";
import { assertPublicEnvForProductionBuild } from "./build-env.js";
import {
  DEFAULT_PUBLIC_API_URL,
  getPublicApiUrl,
  getPublicMedplumBaseUrl,
  getPublicMedplumClientId,
  resolveApiMocking,
} from "./public-env.js";

describe("parseEnv", () => {
  it("applies api defaults for an empty environment", () => {
    const env = parseEnv(apiEnvSchema, {});
    expect(env).toEqual({
      NODE_ENV: "development",
      PORT: 4000,
      HOST: "0.0.0.0",
      RATE_LIMIT_IP_MAX: 1200,
      RATE_LIMIT_USER_MAX: 300,
      RATE_LIMIT_WINDOW_MS: 60_000,
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
    expect(() => parseEnv(workerEnvSchema, { DATABASE_URL: secretish })).not.toThrow(/fixture-url-password/);
    expect(() => parseEnv(workerEnvSchema, { DATABASE_URL: "not a url" })).toThrow(
      "DATABASE_URL (invalid)",
    );
  });

  it("accepts the runtime database URL and the configured tenant for api and worker", () => {
    const source = {
      DATABASE_RUNTIME_URL: "postgres://asc_app:asc_app@localhost:5432/asc_ehr",
      DEFAULT_TENANT_ID: "0b8f3c52-6f3e-4a77-9a55-3d6e1f0c2a10",
      MEDPLUM_PROJECT_ID: "project-1",
    };
    for (const schema of [apiEnvSchema, workerEnvSchema]) {
      expect(parseEnv(schema, source)).toMatchObject(source);
      expect(parseEnv(schema, {})).not.toHaveProperty("DEFAULT_TENANT_ID");
    }
  });

  it("rejects a bad tenant id or runtime URL without echoing them", () => {
    const secretish = "mysql://root:hunter2@db:3306/x";
    expect(() => parseEnv(apiEnvSchema, { DEFAULT_TENANT_ID: "not-a-uuid" })).toThrow(
      "DEFAULT_TENANT_ID (invalid)",
    );
    expect(() => parseEnv(workerEnvSchema, { MEDPLUM_PROJECT_ID: "" })).toThrow(
      "MEDPLUM_PROJECT_ID (invalid)",
    );
    expect(() => parseEnv(apiEnvSchema, { DATABASE_RUNTIME_URL: secretish })).toThrow(
      "DATABASE_RUNTIME_URL (invalid)",
    );
    expect(() => parseEnv(apiEnvSchema, { DATABASE_RUNTIME_URL: secretish })).not.toThrow(/hunter2/);
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

describe("CORS_ORIGINS", () => {
  it("parses a comma-separated list of origins", () => {
    const env = parseEnv(apiEnvSchema, {
      CORS_ORIGINS: " https://app.example.com , https://staging.example.com,",
    });
    expect(env.CORS_ORIGINS).toEqual(["https://app.example.com", "https://staging.example.com"]);
  });

  it.each(["*", "https://app.example.com/", "https://app.example.com/login", "app.example.com", "ftp://x.com"])(
    "rejects %s",
    (value) => {
      expect(() => parseEnv(apiEnvSchema, { CORS_ORIGINS: value })).toThrow("CORS_ORIGINS (invalid)");
    },
  );
});

describe("resolveCorsOrigins", () => {
  it("prefers explicit CORS_ORIGINS", () => {
    const origins = ["https://app.example.com"];
    expect(resolveCorsOrigins({ NODE_ENV: "production", CORS_ORIGINS: origins })).toEqual(origins);
  });

  it("allows the dev web origin locally", () => {
    expect(resolveCorsOrigins({ NODE_ENV: "development", CORS_ORIGINS: undefined })).toEqual([DEV_WEB_ORIGIN]);
    expect(resolveCorsOrigins({ NODE_ENV: "test", CORS_ORIGINS: undefined })).toEqual([DEV_WEB_ORIGIN]);
  });

  it("denies every origin in deployed environments by default", () => {
    expect(resolveCorsOrigins({ NODE_ENV: "production", CORS_ORIGINS: undefined })).toEqual([]);
    expect(resolveCorsOrigins({ NODE_ENV: "staging", CORS_ORIGINS: undefined })).toEqual([]);
  });
});

describe("resolveApiMocking", () => {
  it("is on in development unless disabled", () => {
    expect(resolveApiMocking("development", undefined)).toBe(true);
    expect(resolveApiMocking("development", "disabled")).toBe(false);
  });

  it("is off in production unless explicitly enabled", () => {
    expect(resolveApiMocking("production", undefined)).toBe(false);
    expect(resolveApiMocking("production", "true")).toBe(false);
    expect(resolveApiMocking("production", "enabled")).toBe(true);
  });
});

describe("assertPublicEnvForProductionBuild", () => {
  it("accepts an absolute http(s) URL", () => {
    expect(() => assertPublicEnvForProductionBuild({ NEXT_PUBLIC_API_URL: "https://api.example.com" })).not.toThrow();
    expect(() => assertPublicEnvForProductionBuild({ NEXT_PUBLIC_API_URL: "http://localhost:4000" })).not.toThrow();
  });

  it("fails when the API URL is missing", () => {
    expect(() => assertPublicEnvForProductionBuild({})).toThrow("NEXT_PUBLIC_API_URL is not set");
    expect(() => assertPublicEnvForProductionBuild({ NEXT_PUBLIC_API_URL: "" })).toThrow("NEXT_PUBLIC_API_URL is not set");
  });

  it("fails when the API URL is not absolute http(s)", () => {
    for (const value of ["/api", "api.example.com", "ftp://api.example.com"]) {
      expect(() => assertPublicEnvForProductionBuild({ NEXT_PUBLIC_API_URL: value })).toThrow("absolute http(s) URL");
    }
  });
});

describe("resolveTenantRef", () => {
  const tenant = { DEFAULT_TENANT_ID: "0b8f3c52-6f3e-4a77-9a55-3d6e1f0c2a10", MEDPLUM_PROJECT_ID: "project-1" };

  it("returns the configured tenant and Medplum project", () => {
    expect(resolveTenantRef(parseEnv(apiEnvSchema, tenant))).toEqual({
      tenantId: tenant.DEFAULT_TENANT_ID,
      medplumProjectId: "project-1",
    });
  });

  it("names every missing variable, never a value", () => {
    expect(() => resolveTenantRef(parseEnv(apiEnvSchema, {}))).toThrow(
      "DEFAULT_TENANT_ID (missing), MEDPLUM_PROJECT_ID (missing)",
    );
    expect(() => resolveTenantRef(parseEnv(apiEnvSchema, { MEDPLUM_PROJECT_ID: "project-1" }))).toThrow(
      "DEFAULT_TENANT_ID (missing)",
    );
    expect(() => resolveTenantRef(parseEnv(apiEnvSchema, { DEFAULT_TENANT_ID: tenant.DEFAULT_TENANT_ID }))).not.toThrow(
      /0b8f3c52/,
    );
  });
});

describe("api build id and rate limits", () => {
  it("accepts a short GIT_SHA and rejects free text without echoing it", () => {
    expect(parseEnv(apiEnvSchema, { GIT_SHA: "3b350a5" }).GIT_SHA).toBe("3b350a5");
    expect(() => parseEnv(apiEnvSchema, { GIT_SHA: "Jane Doe was here" })).toThrow("GIT_SHA (invalid)");
    expect(() => parseEnv(apiEnvSchema, { GIT_SHA: "Jane Doe was here" })).not.toThrow(/Jane/);
  });

  it("coerces rate limit knobs and rejects non-positive values", () => {
    expect(parseEnv(apiEnvSchema, { RATE_LIMIT_USER_MAX: "50", RATE_LIMIT_WINDOW_MS: "10000" })).toMatchObject({
      RATE_LIMIT_USER_MAX: 50,
      RATE_LIMIT_WINDOW_MS: 10_000,
    });
    expect(() => parseEnv(apiEnvSchema, { RATE_LIMIT_IP_MAX: "0" })).toThrow("RATE_LIMIT_IP_MAX (invalid)");
  });
});

/** A value that is obviously not a secret, so no literal is ever assigned to a secret-named key. */
const fixture = (name: string) => `fixture-${name}`;

describe("Medplum env", () => {
  const workerClients = JSON.stringify({
    "org-a": { clientId: fixture("client-a"), clientSecret: fixture("secret-a") },
    "org-b": { clientId: fixture("client-b"), clientSecret: fixture("secret-b") },
  });

  it("accepts the Medplum base URL for api and worker, and keeps it optional", () => {
    for (const schema of [apiEnvSchema, workerEnvSchema]) {
      expect(parseEnv(schema, { MEDPLUM_BASE_URL: "http://localhost:8203/" })).toMatchObject({ MEDPLUM_BASE_URL: "http://localhost:8203/" });
      expect(parseEnv(schema, {})).not.toHaveProperty("MEDPLUM_BASE_URL");
    }
    expect(() => parseEnv(apiEnvSchema, { MEDPLUM_BASE_URL: "not a url" })).toThrow("MEDPLUM_BASE_URL (invalid)");
  });

  it("gives the API no Medplum credentials: a client id or secret in its environment is dropped (#57)", () => {
    expect(Object.keys(apiEnvSchema.shape)).not.toEqual(expect.arrayContaining(["MEDPLUM_CLIENT_ID"]));
    expect(Object.keys(apiEnvSchema.shape)).not.toEqual(expect.arrayContaining(["MEDPLUM_CLIENT_SECRET"]));
    expect(Object.keys(apiEnvSchema.shape)).not.toEqual(expect.arrayContaining(["MEDPLUM_WORKER_CLIENTS"]));
    expect(parseEnv(apiEnvSchema, { MEDPLUM_CLIENT_SECRET: fixture("secret") })).not.toHaveProperty("MEDPLUM_CLIENT_SECRET");
  });

  it("parses the worker's per-facility clients (#60)", () => {
    expect(parseEnv(workerEnvSchema, { MEDPLUM_WORKER_CLIENTS: workerClients }).MEDPLUM_WORKER_CLIENTS).toEqual({
      "org-a": { clientId: fixture("client-a"), clientSecret: fixture("secret-a") },
      "org-b": { clientId: fixture("client-b"), clientSecret: fixture("secret-b") },
    });
    expect(parseEnv(workerEnvSchema, {})).not.toHaveProperty("MEDPLUM_WORKER_CLIENTS");
  });

  it("rejects malformed worker clients, naming only the variable", () => {
    for (const bad of ["not json", "[]", JSON.stringify({ "org a": { clientId: "c", clientSecret: "s" } }), JSON.stringify({ "org-a": { clientId: "c" } })]) {
      expect(() => parseEnv(workerEnvSchema, { MEDPLUM_WORKER_CLIENTS: bad })).toThrow("MEDPLUM_WORKER_CLIENTS (invalid)");
    }
  });

  it("never puts a client secret in a validation error", () => {
    const leaked = "CANARY-CLIENT-SECRET";
    let message = "";
    try {
      parseEnv(workerEnvSchema, { MEDPLUM_WORKER_CLIENTS: `{"org-a":{"clientId":"c","clientSecret":"${leaked}"`, REDIS_URL: "nope" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("MEDPLUM_WORKER_CLIENTS (invalid)");
    expect(message).not.toContain(leaked);
  });
});

describe("seedEnvSchema", () => {
  it("defaults the URL and email to the local compose stack, and has no default password", () => {
    expect(parseEnv(seedEnvSchema, { MEDPLUM_SUPER_ADMIN_PASSWORD: fixture("admin") })).toEqual({
      MEDPLUM_BASE_URL: "http://localhost:8203/",
      MEDPLUM_SUPER_ADMIN_EMAIL: "admin@example.com",
      MEDPLUM_SUPER_ADMIN_PASSWORD: fixture("admin"),
    });
    expect(() => parseEnv(seedEnvSchema, {})).toThrow("MEDPLUM_SUPER_ADMIN_PASSWORD (missing)");
  });

  it("only runs against a loopback Medplum, so it cannot seed a shared or deployed one", () => {
    for (const url of ["http://localhost:8203/", "http://127.0.0.1:8203/", "http://[::1]:8203/"]) {
      expect(parseEnv(seedEnvSchema, { MEDPLUM_BASE_URL: url, MEDPLUM_SUPER_ADMIN_PASSWORD: fixture("admin") }).MEDPLUM_BASE_URL).toBe(url);
    }
    for (const url of ["https://medplum.example.com/", "http://10.0.0.5:8103/", "http://localhost.evil.example/", "https://api.medplum.com/"]) {
      expect(() => parseEnv(seedEnvSchema, { MEDPLUM_BASE_URL: url, MEDPLUM_SUPER_ADMIN_PASSWORD: fixture("admin") }), url).toThrow("MEDPLUM_BASE_URL (invalid)");
    }
  });

  it("does not echo credentials", () => {
    expect(() => parseEnv(seedEnvSchema, { MEDPLUM_BASE_URL: `https://user:${fixture("url-password")}@medplum.example.com/`, MEDPLUM_SUPER_ADMIN_PASSWORD: fixture("admin") })).not.toThrow(/hunter2/);
  });
});

describe("public Medplum env", () => {
  it("has no localhost fallback: unset means undefined (LM-010)", () => {
    const base = process.env.NEXT_PUBLIC_MEDPLUM_BASE_URL;
    const client = process.env.NEXT_PUBLIC_MEDPLUM_CLIENT_ID;
    delete process.env.NEXT_PUBLIC_MEDPLUM_BASE_URL;
    delete process.env.NEXT_PUBLIC_MEDPLUM_CLIENT_ID;
    try {
      expect(getPublicMedplumBaseUrl()).toBeUndefined();
      expect(getPublicMedplumClientId()).toBeUndefined();
      process.env.NEXT_PUBLIC_MEDPLUM_BASE_URL = "";
      expect(getPublicMedplumBaseUrl()).toBeUndefined();
      process.env.NEXT_PUBLIC_MEDPLUM_BASE_URL = "https://medplum.example.com";
      process.env.NEXT_PUBLIC_MEDPLUM_CLIENT_ID = "web-client";
      expect(getPublicMedplumBaseUrl()).toBe("https://medplum.example.com");
      expect(getPublicMedplumClientId()).toBe("web-client");
    } finally {
      if (base === undefined) delete process.env.NEXT_PUBLIC_MEDPLUM_BASE_URL;
      else process.env.NEXT_PUBLIC_MEDPLUM_BASE_URL = base;
      if (client === undefined) delete process.env.NEXT_PUBLIC_MEDPLUM_CLIENT_ID;
      else process.env.NEXT_PUBLIC_MEDPLUM_CLIENT_ID = client;
    }
  });
});

describe("FHIR_CANONICAL_BASE", () => {
  const base = {};

  it("is optional for the api and the worker, and kept as given", () => {
    expect(parseEnv(apiEnvSchema, base).FHIR_CANONICAL_BASE).toBeUndefined();
    expect(parseEnv(workerEnvSchema, base).FHIR_CANONICAL_BASE).toBeUndefined();
    expect(parseEnv(apiEnvSchema, { ...base, FHIR_CANONICAL_BASE: "https://fhir.example.test/x/" }).FHIR_CANONICAL_BASE).toBe("https://fhir.example.test/x/");
  });

  it.each(["http://fhir.example.test/x/", "https://fhir.example.test/x", "https://fhir.example.test/x/?a=1", "https://fhir.example.test/x/#t", "not a url"])(
    "rejects %j and names the variable",
    (value) => {
      expect(() => parseEnv(apiEnvSchema, { ...base, FHIR_CANONICAL_BASE: value })).toThrow("FHIR_CANONICAL_BASE");
      expect(() => parseEnv(workerEnvSchema, { ...base, FHIR_CANONICAL_BASE: value })).toThrow("FHIR_CANONICAL_BASE");
    },
  );
});
