import { API_ROUTES } from "@asc/config/api";
import type { AuthSession, LoginCredentials, SignupPayload, UserProfile, UserRole } from "@asc/types";
import { delay, http, HttpResponse } from "msw";
import { DEMO_PRESETS, MOCK_USER_PROFILES } from "../data/users";
import { openSession } from "../db/sessions";
import { apiUrl } from "./api-url";

const DAY_MS = 86_400_000;
const FACILITY_NAME = "Metro GI Ambulatory Surgery Center";
const FALLBACK_PROFILE_EMAIL = "surgeon@ascehr.demo";

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

function fallbackProfile(email: string): UserProfile {
  return {
    id: `usr_${Date.now()}`,
    email,
    fullName: email.split("@")[0] ?? "Staff Clinician",
    role: "SURGEON",
    roleTitle: "Staff Gastroenterologist",
    initials: "SC",
    facilityName: FACILITY_NAME,
  };
}

export const authHandlers = [
  http.get(apiUrl(API_ROUTES.authDemoPresets), async () => {
    await delay(80);
    return HttpResponse.json(DEMO_PRESETS);
  }),

  http.post(apiUrl(API_ROUTES.authLogin), async ({ request }) => {
    await delay(150);
    const { email } = (await request.json()) as LoginCredentials;
    const normalizedEmail = email.toLowerCase().trim();
    const profile = MOCK_USER_PROFILES[normalizedEmail] ?? fallbackProfile(email);
    return HttpResponse.json(session(profile, "mock_jwt"));
  }),

  http.post(apiUrl(API_ROUTES.authDemoLogin), async ({ request }) => {
    await delay(100);
    const { presetId } = (await request.json()) as { presetId: string };
    const email = DEMO_PRESETS.find((preset) => preset.id === presetId)?.email ?? FALLBACK_PROFILE_EMAIL;
    const profile = MOCK_USER_PROFILES[email] ?? MOCK_USER_PROFILES[FALLBACK_PROFILE_EMAIL];
    if (!profile) return HttpResponse.json({ message: "Unknown demo preset", code: "DEMO_PRESET_UNKNOWN" }, { status: 404 });
    return HttpResponse.json(session(profile, "mock_demo_jwt"));
  }),

  http.post(apiUrl(API_ROUTES.authSignup), async ({ request }) => {
    await delay(200);
    const { password: _password, facilityCode: _facilityCode, ...payload } = (await request.json()) as SignupPayload;
    const user: UserProfile = {
      ...payload,
      id: `usr_${Date.now()}`,
      roleTitle: ROLE_TITLES[payload.role],
      initials: initialsOf(payload.fullName),
      facilityName: FACILITY_NAME,
    };
    return HttpResponse.json(session(user, "mock_jwt_signup"));
  }),
];
