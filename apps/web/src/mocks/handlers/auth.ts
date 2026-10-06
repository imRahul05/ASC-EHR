import { API_ROUTES } from "@asc/config/api";
import type { AuthSession, LoginCredentials, SignupPayload, UserProfile, UserRole } from "@asc/types";
import { delay, http, HttpResponse } from "msw";
import { signupIdentity } from "../data/identities";
import { DEMO_PRESETS } from "../data/users";
import { openSession } from "../db/sessions";
import { findUser, registerSignedUpUser } from "../db/users";
import { apiUrl } from "./api-url";

const DAY_MS = 86_400_000;
const FACILITY_NAME = "Metro GI Ambulatory Surgery Center";

const ROLE_TITLES: Record<UserRole, string> = {
  SURGEON: "Attending Gastroenterologist",
  ANESTHESIOLOGIST: "Staff Anesthesiologist",
  NURSE: "Staff Registered Nurse",
  ADMIN: "Center Administrator",
  PATIENT: "Registered Patient",
};

function session(user: UserProfile, tokenPrefix: string): AuthSession {
  const token = `${tokenPrefix}_${user.id}_${Date.now()}`;
  openSession(token, user.email);
  return { user, token, expiresAt: new Date(Date.now() + DAY_MS).toISOString() };
}

function initialsOf(fullName: string): string {
  const initials = fullName
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials || "US";
}

const error = (status: number, code: string, message: string) => HttpResponse.json({ message, code }, { status });

export const authHandlers = [
  http.get(apiUrl(API_ROUTES.authDemoPresets), async () => {
    await delay(80);
    return HttpResponse.json(DEMO_PRESETS);
  }),

  // Fail closed: an unknown email is rejected, never mapped to a default user.
  http.post(apiUrl(API_ROUTES.authLogin), async ({ request }) => {
    await delay(150);
    const { email } = (await request.json()) as LoginCredentials;
    const user = findUser(email);
    if (user === undefined) return error(401, "AUTH_INVALID", "Invalid email or password");
    return HttpResponse.json(session(user.profile, "mock_jwt"));
  }),

  http.post(apiUrl(API_ROUTES.authDemoLogin), async ({ request }) => {
    await delay(100);
    const { presetId } = (await request.json()) as { presetId: string };
    const preset = DEMO_PRESETS.find((item) => item.id === presetId);
    const user = preset === undefined ? undefined : findUser(preset.email);
    if (user === undefined) return error(404, "DEMO_PRESET_UNKNOWN", "Unknown demo preset");
    return HttpResponse.json(session(user.profile, "mock_demo_jwt"));
  }),

  http.post(apiUrl(API_ROUTES.authSignup), async ({ request }) => {
    await delay(200);
    const { password: _password, facilityCode: _facilityCode, ...payload } = (await request.json()) as SignupPayload;
    if (findUser(payload.email) !== undefined) return error(409, "AUTH_EMAIL_TAKEN", "That email is already registered");
    const user: UserProfile = {
      ...payload,
      id: `usr_${Date.now()}`,
      roleTitle: ROLE_TITLES[payload.role],
      initials: initialsOf(payload.fullName),
      facilityName: FACILITY_NAME,
    };
    registerSignedUpUser(user, signupIdentity(payload.role, user.id));
    return HttpResponse.json(session(user, "mock_jwt_signup"));
  }),
];
