import { z } from "zod";

/**
 * Server-side environment parsing.
 *
 * Every Node process (api, worker) parses its env once at startup with
 * `parseEnv(schema)` instead of reading `process.env` ad hoc. Failures list
 * variable NAMES only: env values can be secrets and must never be logged.
 */

export type EnvSource = Readonly<Record<string, string | undefined>>;

export const nodeEnvSchema = z
  .enum(["development", "test", "staging", "production"])
  .default("development");

export const appEnvSchema = z.enum(["development", "staging", "production"]).optional();

export const logLevelSchema = z
  .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
  .default("info");

const otelEndpointSchema = z.string().url().optional();

/**
 * App-owned Postgres (@asc/db). Optional for now: it becomes REQUIRED once the
 * first agent job persists run records (AgentRunStore). Deployed environments
 * must use TLS (`?sslmode=require`). The URL holds credentials — never log it.
 */
export const databaseUrlSchema = z
  .string()
  .url()
  .refine((value) => /^postgres(ql)?:\/\//.test(value), { message: "expected a postgres:// URL" })
  .optional();

/**
 * Runtime database role URL (`asc_app`, member of `asc_runtime`): NOT the table
 * owner, cannot alter tables or bypass row-level security. Apps use this URL;
 * `DATABASE_URL` is the owner URL for migrations only. Optional until the API
 * and worker open a tenant-scoped connection (P05g). Holds credentials: never log it.
 */
export const databaseRuntimeUrlSchema = databaseUrlSchema;

/**
 * The one configured tenant (single hospital, tenant-ready). Read by
 * `StaticTenantResolver`; never taken from a request. Optional until P05g
 * resolves the tenant on every request.
 */
export const defaultTenantIdSchema = z.string().uuid().optional();

/** Medplum Project of the configured tenant (token project must equal this, gate 1). */
export const medplumProjectIdSchema = z.string().min(1).optional();

/**
 * Build identifier (git SHA) recorded in audit decisions so an auditor can tie a
 * decision to the code that made it. Short identifier only: letters, digits, `.`, `_`, `-`.
 */
export const gitShaSchema = z
  .string()
  .regex(/^[A-Za-z0-9._-]{1,64}$/, { message: "expected a short identifier such as a git SHA" })
  .optional();

/**
 * Optional override of the canonical URL base of our FHIR profiles and identifier systems
 * (the default lives in `@asc/fhir`, issue #54). Same rule as `assertCanonicalBase`
 * in `@asc/fhir`: https, ends in "/", no query or fragment. The value is stored inside every
 * resource, so it must be identical wherever data is shared; leave it unset unless a migration says
 * otherwise. Applies to api and worker; the web app builds with the default.
 */
export const fhirCanonicalBaseSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://") && value.endsWith("/") && !value.includes("?") && !value.includes("#"), {
    message: "expected an https URL ending in / with no query or fragment",
  })
  .optional();

/** Medplum connection shared by the server processes (api, worker). */
const medplumServerEnvShape = {
  FHIR_CANONICAL_BASE: fhirCanonicalBaseSchema,
  MEDPLUM_BASE_URL: z.string().url().optional(),
};

const workerClientsRecordSchema = z.record(
  z.string().regex(/^[A-Za-z0-9.-]{1,64}$/),
  z.object({ clientId: z.string().min(1), clientSecret: z.string().min(1) }).strict(),
);

/**
 * The worker's Medplum credentials, ONE client per facility (#60): a JSON object keyed by facility
 * (`Organization` id), `{"<facilityId>":{"clientId":"…","clientSecret":"…"}}`. The worker picks the client from
 * a job's validated `facilityId`, so Medplum confines the job to that facility. There is no tenant-wide worker
 * client. The secrets come from Key Vault in deployed environments; never log this value. The API has no
 * Medplum credentials at all: it forwards the signed-in user's token (#57).
 */
export const medplumWorkerClientsSchema = z
  .string()
  .transform((value, context) => {
    // One issue at the variable itself, never nested paths: a misplaced secret could otherwise show up as a key.
    let json: unknown;
    try {
      json = JSON.parse(value);
    } catch {
      json = undefined;
    }
    const parsed = workerClientsRecordSchema.safeParse(json);
    if (!parsed.success) {
      context.addIssue({ code: "custom", message: "expected {facilityId: {clientId, clientSecret}}" });
      return z.NEVER;
    }
    return parsed.data;
  })
  .optional();

export type MedplumWorkerClients = NonNullable<z.infer<typeof medplumWorkerClientsSchema>>;

/** True for a loopback host: the only place the local seed may run. */
function isLoopbackUrl(value: string): boolean {
  try {
    const { hostname } = new URL(value);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

/**
 * Environment of the local seed script (`pnpm medplum:seed`). The URL and email default to
 * the local compose stack. The super admin password has NO default: `pnpm medplum:up`
 * generates it per machine (git-ignored) and the seed reads it from there, or from the
 * environment. The base URL must be loopback so the seed can never write synthetic data
 * into a shared or deployed Medplum.
 */
export const seedEnvSchema = z.object({
  MEDPLUM_BASE_URL: z
    .string()
    .url()
    .default("http://localhost:8203/")
    .refine(isLoopbackUrl, { message: "the local seed only runs against localhost" }),
  MEDPLUM_SUPER_ADMIN_EMAIL: z.string().email().default("admin@example.com"),
  MEDPLUM_SUPER_ADMIN_PASSWORD: z.string().min(1),
});

export type SeedEnv = z.infer<typeof seedEnvSchema>;

/** Origin of `next dev` (apps/web). Allowed by CORS only in development/test. */
export const DEV_WEB_ORIGIN = "http://localhost:3000";

/** True when the value is exactly a web origin (`scheme://host[:port]`, no path or trailing slash). */
function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === value;
  } catch {
    return false;
  }
}

/**
 * Browser origins allowed to call apps/api cross-origin: comma-separated exact
 * origins, e.g. `https://app.example.com,https://staging.example.com`.
 * Wildcards are rejected on purpose (the API serves PHI).
 */
export const corsOriginsSchema = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  )
  .refine((origins) => origins.every(isOrigin), {
    message: "expected comma-separated origins like https://app.example.com",
  })
  .optional();

export const apiEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  APP_ENV: appEnvSchema,
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().min(1).default("0.0.0.0"),
  CORS_ORIGINS: corsOriginsSchema,
  DATABASE_URL: databaseUrlSchema,
  DATABASE_RUNTIME_URL: databaseRuntimeUrlSchema,
  DEFAULT_TENANT_ID: defaultTenantIdSchema,
  MEDPLUM_PROJECT_ID: medplumProjectIdSchema,
  GIT_SHA: gitShaSchema,
  ...medplumServerEnvShape,
  // Requests per window. IP: coarse flood guard in front of authentication (a clinic shares
  // one address, so it is high). User: per tenant and signed-in user.
  RATE_LIMIT_IP_MAX: z.coerce.number().int().min(1).default(1200),
  RATE_LIMIT_USER_MAX: z.coerce.number().int().min(1).default(300),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  LOG_LEVEL: logLevelSchema,
  OTEL_EXPORTER_OTLP_ENDPOINT: otelEndpointSchema,
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/**
 * Origins the API answers CORS for. An explicit CORS_ORIGINS always wins;
 * otherwise development/test allow `next dev`, and every deployed
 * environment allows none (deny by default).
 */
export function resolveCorsOrigins(env: Pick<ApiEnv, "NODE_ENV" | "CORS_ORIGINS">): string[] {
  if (env.CORS_ORIGINS) return env.CORS_ORIGINS;
  const isLocal = env.NODE_ENV === "development" || env.NODE_ENV === "test";
  return isLocal ? [DEV_WEB_ORIGIN] : [];
}

/**
 * The one configured tenant, required by the API from P05g on (the schemas keep
 * the variables optional because the worker does not read them yet). Names the
 * missing variables only, never values.
 */
export function resolveTenantRef(env: Pick<ApiEnv, "DEFAULT_TENANT_ID" | "MEDPLUM_PROJECT_ID">): {
  readonly tenantId: string;
  readonly medplumProjectId: string;
} {
  const missing = (["DEFAULT_TENANT_ID", "MEDPLUM_PROJECT_ID"] as const).filter((name) => env[name] === undefined);
  if (env.DEFAULT_TENANT_ID === undefined || env.MEDPLUM_PROJECT_ID === undefined) {
    throw new EnvValidationError(missing, missing.map((name) => `${name} (missing)`));
  }
  return { tenantId: env.DEFAULT_TENANT_ID, medplumProjectId: env.MEDPLUM_PROJECT_ID };
}

export const workerEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  APP_ENV: appEnvSchema,
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  DATABASE_URL: databaseUrlSchema,
  DATABASE_RUNTIME_URL: databaseRuntimeUrlSchema,
  DEFAULT_TENANT_ID: defaultTenantIdSchema,
  MEDPLUM_PROJECT_ID: medplumProjectIdSchema,
  ...medplumServerEnvShape,
  MEDPLUM_WORKER_CLIENTS: medplumWorkerClientsSchema,
  // Queue NAMES are code constants (apps/worker/src/queues.ts); only capacity
  // knobs live in env. Concurrency is per worker process; the rate limit is
  // enforced by BullMQ across ALL workers of a queue (jobs per duration).
  INTERACTIVE_CONCURRENCY: z.coerce.number().int().min(1).default(5),
  INTERACTIVE_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(60),
  INTERACTIVE_RATE_LIMIT_DURATION_MS: z.coerce.number().int().min(1).default(60_000),
  BACKGROUND_CONCURRENCY: z.coerce.number().int().min(1).default(2),
  BACKGROUND_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  BACKGROUND_RATE_LIMIT_DURATION_MS: z.coerce.number().int().min(1).default(60_000),
  LOG_LEVEL: logLevelSchema,
  OTEL_EXPORTER_OTLP_ENDPOINT: otelEndpointSchema,
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export class EnvValidationError extends Error {
  readonly variables: readonly string[];

  constructor(variables: readonly string[], details: readonly string[]) {
    super(`Invalid environment configuration: ${details.join(", ")}`);
    this.name = "EnvValidationError";
    this.variables = variables;
  }
}

function describeIssue(issue: z.ZodIssue): string {
  const name = issue.path.map(String).join(".") || "(root)";
  // Deliberately NOT using issue.message: zod messages can echo the received value.
  const missing = issue.code === z.ZodIssueCode.invalid_type && issue.received === "undefined";
  return `${name} (${missing ? "missing" : "invalid"})`;
}

/**
 * Parse and validate environment variables against a zod schema.
 * Throws a single `EnvValidationError` naming every missing/invalid variable.
 * The error never contains variable values.
 */
export function parseEnv<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  source: EnvSource = process.env,
): z.infer<TSchema> {
  const result = schema.safeParse(source);
  if (result.success) {
    return result.data as z.infer<TSchema>;
  }
  const details = [...new Set(result.error.issues.map(describeIssue))];
  const variables = [
    ...new Set(result.error.issues.map((issue) => issue.path.map(String).join("."))),
  ];
  throw new EnvValidationError(variables, details);
}
