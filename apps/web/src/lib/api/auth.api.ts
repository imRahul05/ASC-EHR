import type { AuthSession, LoginCredentials, SignupPayload } from "@asc/types";
import { mockDemoLogin, mockLogin, mockSignup } from "../mock/handlers/auth.mock";

/**
 * Authentication API module.
 * Currently backed by the centralized mock layer.
 * To connect to real backend, replace mock calls with:
 * return http.post<AuthSession>("/auth/login", credentials);
 */
export async function loginWithCredentials(credentials: LoginCredentials): Promise<AuthSession> {
  return mockLogin(credentials);
}

export async function loginWithDemoPreset(presetId: string): Promise<AuthSession> {
  return mockDemoLogin(presetId);
}

export async function registerUser(payload: SignupPayload): Promise<AuthSession> {
  return mockSignup(payload);
}
