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

export const apiEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  APP_ENV: appEnvSchema,
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().min(1).default("0.0.0.0"),
  LOG_LEVEL: logLevelSchema,
  OTEL_EXPORTER_OTLP_ENDPOINT: otelEndpointSchema,
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export const workerEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  APP_ENV: appEnvSchema,
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
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
