import pino from "pino";
import type { Bindings, DestinationStream, LoggerOptions } from "pino";

import { buildRedactPaths, REDACT_CENSOR } from "./redaction.js";

export {
  SENSITIVE_KEYS,
  REDACT_CENSOR,
  REDACT_WILDCARD_DEPTH,
  buildRedactPaths,
  isSensitiveKey,
  normalizeKey,
} from "./redaction.js";
export type { SensitiveKey } from "./redaction.js";

export type Logger = pino.Logger;
export type { LoggerOptions, DestinationStream, Bindings };

const VALID_LEVELS = new Set<string>([
  ...Object.keys(pino.levels.values),
  "silent",
]);

/** Returns `level` if it is a valid pino level, otherwise "info". */
export function resolveLogLevel(level: string | undefined): string {
  const normalized = level?.trim().toLowerCase();
  return normalized && VALID_LEVELS.has(normalized) ? normalized : "info";
}

/** Builds pino options for the given environment (defaults to process.env). */
export function buildLoggerOptions(
  env: { NODE_ENV?: string; LOG_LEVEL?: string } = process.env,
): LoggerOptions {
  const isDev = env.NODE_ENV === "development";
  return {
    level: resolveLogLevel(env.LOG_LEVEL),
    redact: {
      paths: buildRedactPaths(),
      censor: REDACT_CENSOR,
    },
    // Structured error logging: `logger.error({ err }, "...")`.
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
    // Development only: human-readable output. Staging/production: JSON to stdout.
    ...(isDev && {
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
    }),
  };
}

/** Shared options (also passed to Fastify's `logger` option in apps/api). */
export const loggerOptions: LoggerOptions = buildLoggerOptions();

/**
 * Creates a logger with the shared (redacting) configuration.
 * When `destination` is supplied (e.g. in tests) the dev transport is dropped,
 * since pino cannot combine a transport with an explicit destination.
 */
export function buildLogger(
  options: LoggerOptions = loggerOptions,
  destination?: DestinationStream,
): Logger {
  if (destination) {
    const { transport: _transport, ...rest } = options;
    return pino(rest, destination);
  }
  return pino(options);
}

/** Singleton logger for generic/worker use. */
export const logger: Logger = buildLogger();

/** Child logger of the shared singleton with extra bindings (e.g. `{ module: "jobs" }`). */
export function createLogger(bindings: Bindings): Logger {
  return logger.child(bindings);
}
