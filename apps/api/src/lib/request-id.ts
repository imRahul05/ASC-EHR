import { randomUUID } from "node:crypto";

/** Allowed shape for client-supplied correlation/request IDs (prevents log injection). */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

type HeaderValue = string | string[] | undefined;

function firstValue(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Pick a request ID: the first well-formed value from `x-correlation-id` or
 * `x-request-id`, otherwise a fresh UUID. Malformed client values are ignored,
 * never echoed into logs.
 */
export function resolveRequestId(
  headers: Readonly<Record<string, HeaderValue>>,
  generate: () => string = randomUUID,
): string {
  for (const name of ["x-correlation-id", "x-request-id"] as const) {
    const candidate = firstValue(headers[name]);
    if (candidate !== undefined && REQUEST_ID_PATTERN.test(candidate)) {
      return candidate;
    }
  }
  return generate();
}
