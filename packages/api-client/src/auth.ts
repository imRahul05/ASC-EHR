import { API_ROUTES } from "@asc/config/api";
import type { AuthSession, DemoAccountPreset, LoginCredentials, SignupPayload } from "@asc/types";
import { http } from "./http";

export function loginWithCredentials(credentials: LoginCredentials): Promise<AuthSession> {
  return http.post<AuthSession>(API_ROUTES.authLogin, credentials);
}

export function loginWithDemoPreset(presetId: string): Promise<AuthSession> {
  return http.post<AuthSession>(API_ROUTES.authDemoLogin, { presetId });
}

export function getDemoPresets(): Promise<readonly DemoAccountPreset[]> {
  return http.get<readonly DemoAccountPreset[]>(API_ROUTES.authDemoPresets);
}

export function registerUser(payload: SignupPayload): Promise<AuthSession> {
  return http.post<AuthSession>(API_ROUTES.authSignup, payload);
}
