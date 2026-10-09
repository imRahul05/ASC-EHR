/**
 * Browser-safe public env. Only NEXT_PUBLIC_* values belong here.
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time ONLY when the
 * property is referenced literally (dot access, no destructuring, no dynamic
 * keys). Keep every reference below in that literal form.
 */

export const DEFAULT_PUBLIC_API_URL = "http://localhost:4000";

export function getPublicApiUrl(): string {
  const value =
    typeof process === "undefined" ? undefined : process.env.NEXT_PUBLIC_API_URL;
  return value && value.length > 0 ? value : DEFAULT_PUBLIC_API_URL;
}

/**
 * MSW API mocking (apps/web) from NODE_ENV and NEXT_PUBLIC_API_MOCKING:
 * - development: on unless the flag is "disabled";
 * - production builds: off unless the flag is exactly "enabled" (hosted demo).
 */
export function resolveApiMocking(nodeEnv: string | undefined, flag: string | undefined): boolean {
  return nodeEnv === "production" ? flag === "enabled" : flag !== "disabled";
}

export function isApiMockingEnabled(): boolean {
  if (typeof process === "undefined") return false;
  return resolveApiMocking(process.env.NODE_ENV, process.env.NEXT_PUBLIC_API_MOCKING);
}

function nonEmpty(value: string | undefined): string | undefined {
  return value !== undefined && value.length > 0 ? value : undefined;
}

/**
 * Medplum base URL and client id for browser sign-in (P05j). No localhost fallback:
 * a deployed build must fail rather than ship a dev default (LM-010), so callers get
 * `undefined` when unset and decide.
 */
export function getPublicMedplumBaseUrl(): string | undefined {
  return nonEmpty(typeof process === "undefined" ? undefined : process.env.NEXT_PUBLIC_MEDPLUM_BASE_URL);
}

export function getPublicMedplumClientId(): string | undefined {
  return nonEmpty(typeof process === "undefined" ? undefined : process.env.NEXT_PUBLIC_MEDPLUM_CLIENT_ID);
}

export function isProductionBuild(): boolean {
  return typeof process !== "undefined" && process.env.NODE_ENV === "production";
}

export const publicEnv = {
  get NEXT_PUBLIC_API_URL(): string {
    return getPublicApiUrl();
  },
  get NEXT_PUBLIC_MEDPLUM_BASE_URL(): string | undefined {
    return getPublicMedplumBaseUrl();
  },
  get NEXT_PUBLIC_MEDPLUM_CLIENT_ID(): string | undefined {
    return getPublicMedplumClientId();
  },
  get isProduction(): boolean {
    return isProductionBuild();
  },
} as const;
