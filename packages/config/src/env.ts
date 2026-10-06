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

export const workerEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  APP_ENV: appEnvSchema,
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  DATABASE_URL: databaseUrlSchema,
  DATABASE_RUNTIME_URL: databaseRuntimeUrlSchema,
  DEFAULT_TENANT_ID: defaultTenantIdSchema,
  MEDPLUM_PROJECT_ID: medplumProjectIdSchema,
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
