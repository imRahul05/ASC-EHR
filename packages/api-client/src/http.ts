import { HTTP_TIMEOUT_MS } from "@asc/config/api";
import { getPublicApiUrl } from "@asc/config/public-env";
import type { ApiErrorDetails } from "@asc/types";
import { apiErrorPayloadSchema } from "@asc/validation/api-error";

/** Every failed request from @asc/api-client rejects with this error. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: Record<string, string>;

  constructor(error: ApiErrorDetails) {
    super(error.message);
    this.name = "ApiError";
    this.status = error.status;
    this.code = error.code;
    this.details = error.details;
  }
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions {
  readonly query?: Readonly<Record<string, string>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
}

/**
 * Bearer token of the signed-in session, held in memory only (never browser storage, LM-004).
 * Set by the app on sign-in, cleared on logout.
 */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Authorization header for the current session (empty when signed out). */
export function authHeaders(): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

/** Appends `path` to the API base URL, keeping any base path (e.g. a proxy under `/api`). */
export function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const base = getPublicApiUrl().replace(/\/+$/, "");
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  return url.toString();
}

/** Drops undefined values so optional filters can be passed straight through as `query`. */
export function toQuery(params: object): Record<string, string> {
  const entries = Object.entries(params as Record<string, unknown>).filter(
    (entry): entry is [string, string | number | boolean] =>
      typeof entry[1] === "string" || typeof entry[1] === "number" || typeof entry[1] === "boolean",
  );
  return Object.fromEntries(entries.map(([key, value]) => [key, String(value)]));
}

export async function toApiError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => undefined);
  const payload = apiErrorPayloadSchema.safeParse(body);
  const data = payload.success ? payload.data : {};
  return new ApiError({
    status: response.status,
    message: data.message ?? `Request failed with status ${response.status}`,
    code: data.code,
    details: data.details,
  });
}

async function request<T>(method: HttpMethod, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const timeout = AbortSignal.timeout(HTTP_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      signal,
      headers: { Accept: "application/json", "Content-Type": "application/json", ...authHeaders(), ...options.headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed";
    throw new ApiError({ status: 0, message, code: "NETWORK_ERROR" });
  }
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** JSON HTTP client for apps/api. Paths come from `API_ROUTES` in @asc/config. */
export const http = {
  get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("POST", path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("PUT", path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("PATCH", path, body, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>("DELETE", path, undefined, options),
};
