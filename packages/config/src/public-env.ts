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

export const publicEnv = {
  get NEXT_PUBLIC_API_URL(): string {
    return getPublicApiUrl();
  },
} as const;
