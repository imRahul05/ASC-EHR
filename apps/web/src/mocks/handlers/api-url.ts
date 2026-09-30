import { buildUrl } from "@asc/api-client";

/** Absolute URL the mocks intercept — built exactly like @asc/api-client requests. */
export function apiUrl(path: string): string {
  return buildUrl(path);
}
