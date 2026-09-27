import { getPublicApiUrl } from "@asc/config/public-env";

/** Absolute URL the mocks intercept — same base URL @asc/api-client calls. */
export function apiUrl(path: string): string {
  return `${getPublicApiUrl()}${path}`;
}
