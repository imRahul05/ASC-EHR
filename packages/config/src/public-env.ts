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

export const publicEnv = {
  get NEXT_PUBLIC_API_URL(): string {
    return getPublicApiUrl();
  },
} as const;
