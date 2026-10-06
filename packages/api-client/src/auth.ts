import { API_ROUTES } from "@asc/config/api";
import type { AuthSession, DemoAccountPreset, DemoPersonaId, LoginCredentials, SignupPayload } from "@asc/types";
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

export function registerUser(payload: SignupPayload): Promise<AuthSession> {
  return http.post<AuthSession>(API_ROUTES.authSignup, payload);
}

/**
 * Ask an administrator for an account. Never signs anyone in or creates one; the response is
 * the same whether or not the email is known, so it cannot be used to probe for accounts.
 */
export async function requestAccess(payload: AccessRequestFormData): Promise<void> {
  await http.post<unknown>(API_ROUTES.authAccessRequest, accessRequestSchema.parse(payload));
}

/** The signed-in principal (per-facility grants) and display names for its facilities. */
export async function getMe(): Promise<MeResponse> {
  const parsed = meResponseSchema.safeParse(await http.get<unknown>(API_ROUTES.me));
  if (!parsed.success) throw new Error("Unexpected /me response shape");
  return parsed.data;
}
