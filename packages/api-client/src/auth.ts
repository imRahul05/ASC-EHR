import { API_ROUTES } from "@asc/config/api";
import type { AuthSession, DemoAccountPreset, DemoPersonaId, LoginCredentials } from "@asc/types";
import { accessRequestSchema, type AccessRequestFormData } from "@asc/validation/auth";
import { meResponseSchema, type MeResponse } from "@asc/validation/authz";
import { http } from "./http";

export function loginWithCredentials(credentials: LoginCredentials): Promise<AuthSession> {
  return http.post<AuthSession>(API_ROUTES.authLogin, credentials);
}

export function loginWithDemoPreset(presetId: DemoPersonaId): Promise<AuthSession> {
  return http.post<AuthSession>(API_ROUTES.authDemoLogin, { presetId });
}

export function getDemoPresets(): Promise<readonly DemoAccountPreset[]> {
  return http.get<readonly DemoAccountPreset[]>(API_ROUTES.authDemoPresets);
}

export interface TokenExchangeResult {
  readonly accessToken: string;
  readonly idToken?: string;
  readonly expiresIn?: number;
}

function webAuthUrl(path: string): string {
  if (typeof window !== "undefined") return path;
  return `http://localhost:3000${path}`;
}

/**
 * Exchanges a PKCE authorization code + codeVerifier for access tokens via apps/web token handler.
 */
export async function exchangeWebAuthCode(code: string, codeVerifier: string): Promise<TokenExchangeResult> {
  const response = await fetch(webAuthUrl("/api/auth/token"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, codeVerifier }),
  });
  if (!response.ok) {
    throw new Error(`Token exchange failed with status ${response.status}`);
  }
  return response.json() as Promise<TokenExchangeResult>;
}

/**
 * Silently refreshes the user's access token using the httpOnly refresh cookie.
 */
export async function refreshWebAuthToken(): Promise<TokenExchangeResult> {
  const response = await fetch(webAuthUrl("/api/auth/token"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grantType: "refresh_token" }),
  });
  if (!response.ok) {
    throw new Error(`Token refresh failed with status ${response.status}`);
  }
  return response.json() as Promise<TokenExchangeResult>;
}

/**
 * Clears the session on the web server (clearing the httpOnly refresh cookie).
 */
export async function logoutWebSession(): Promise<void> {
  await fetch(webAuthUrl("/api/auth/logout"), {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
}

/**
 * Ask an administrator for an account. Never signs anyone in or creates one; the response is
 * the same whether or not the email is known, so it cannot be used to probe for accounts.
 */
export async function requestAccess(payload: AccessRequestFormData): Promise<void> {
  await http.post<Record<string, never>>(API_ROUTES.authAccessRequest, accessRequestSchema.parse(payload));
}

/** The signed-in principal (per-facility grants) and display names for its facilities. */
export async function getMe(): Promise<MeResponse> {
  const raw = await http.get<MeResponse>(API_ROUTES.me);
  const parsed = meResponseSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Unexpected /me response shape");
  return parsed.data;
}
