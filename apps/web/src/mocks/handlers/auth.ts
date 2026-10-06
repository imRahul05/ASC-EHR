import { API_ROUTES } from "@asc/config/api";
import type { AuthSession, LoginCredentials, UserProfile } from "@asc/types";
import { accessRequestSchema } from "@asc/validation/auth";
import { delay, http, HttpResponse } from "msw";
import { DEMO_PRESETS } from "../data/users";
import { addAccessRequest } from "../db/access-requests";
import { openSession } from "../db/sessions";
import { findUser } from "../db/users";
import { apiUrl } from "./api-url";

const DAY_MS = 86_400_000;

function session(user: UserProfile, tokenPrefix: string): AuthSession {
  const token = `${tokenPrefix}_${user.id}_${Date.now()}`;
  openSession(token, user.email);
  return { user, token, expiresAt: new Date(Date.now() + DAY_MS).toISOString() };
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

  // No account is created and nobody is signed in. Known and unknown emails get the same answer.
  http.post(apiUrl(API_ROUTES.authAccessRequest), async ({ request }) => {
    await delay(200);
    const parsed = accessRequestSchema.safeParse(await request.json());
    if (!parsed.success) return error(400, "ACCESS_REQUEST_INVALID", "Check your name and email");
    addAccessRequest(parsed.data);
    return HttpResponse.json({ status: "received" }, { status: 202 });
  }),
];
