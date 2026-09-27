/**
 * HTTP API surface shared by @asc/api-client (callers), apps/api (routes) and
 * the apps/web dev mocks (MSW handlers), so paths are never retyped as strings.
 */
export const API_ROUTES = {
  health: "/health",
  authLogin: "/auth/login",
  authDemoLogin: "/auth/demo-login",
  authDemoPresets: "/auth/demo-presets",
  authSignup: "/auth/signup",
  dashboard: "/dashboard",
  caseStatus: (caseId: string) => `/cases/${encodeURIComponent(caseId)}/status`,
} as const;

/** Route pattern form of the parameterised paths (for server/mocks route matching). */
export const API_ROUTE_PATTERNS = {
  caseStatus: "/cases/:caseId/status",
} as const;

/** Client-side request timeout for JSON API calls. */
export const HTTP_TIMEOUT_MS = 15_000;
