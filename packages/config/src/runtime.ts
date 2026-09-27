/**
 * The only place (with env.ts / public-env.ts) allowed to touch `process.env`.
 * Packages that need a default environment (logger, telemetry, audit) take it
 * from here instead of reading `process.env` themselves.
 */
export type ProcessEnv = Readonly<Record<string, string | undefined>>;

export function getProcessEnv(): ProcessEnv {
  return typeof process === "undefined" ? {} : process.env;
}

export function isProductionEnv(env: ProcessEnv = getProcessEnv()): boolean {
  return env.NODE_ENV === "production";
}
