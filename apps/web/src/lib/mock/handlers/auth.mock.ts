import type { AuthSession, LoginCredentials, SignupPayload, UserProfile } from "@asc/types";
import { DEMO_PRESETS, MOCK_USER_PROFILES } from "../data/users.mock";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function mockLogin(credentials: LoginCredentials): Promise<AuthSession> {
  await delay(150);

  const normalizedEmail = credentials.email.toLowerCase().trim();
  const profile = MOCK_USER_PROFILES[normalizedEmail];

  if (!profile) {
    // If not a predefined email, generate a mock profile based on surgeon role fallback
    const fallbackProfile: UserProfile = {
      id: `usr_${Date.now()}`,
      email: credentials.email,
      fullName: credentials.email.split("@")[0] ?? "Staff Clinician",
      role: "SURGEON",
      roleTitle: "Staff Gastroenterologist",
      initials: "SC",
      facilityName: "Metro GI Ambulatory Surgery Center",
    };

    return {
      user: fallbackProfile,
      token: `mock_jwt_${Date.now()}`,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };
  }

  return {
    user: profile,
    token: `mock_jwt_${profile.id}_${Date.now()}`,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
}

export async function mockDemoLogin(presetId: string): Promise<AuthSession> {
  await delay(100);

  const preset = DEMO_PRESETS.find((p) => p.id === presetId);
  const email = preset ? preset.email : "surgeon@ascehr.demo";
  const profile = MOCK_USER_PROFILES[email] ?? MOCK_USER_PROFILES["surgeon@ascehr.demo"];

  return {
    user: profile,
    token: `mock_demo_jwt_${profile.id}`,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
}

export async function mockSignup(payload: SignupPayload): Promise<AuthSession> {
  await delay(200);

  const initials = payload.fullName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const roleTitleMap: Record<string, string> = {
    SURGEON: "Attending Gastroenterologist",
    ANESTHESIOLOGIST: "Staff Anesthesiologist",
    NURSE: "Staff Registered Nurse",
    ADMIN: "Center Administrator",
    PATIENT: "Registered Patient",
  };

  const newUser: UserProfile = {
    id: `usr_${Date.now()}`,
    email: payload.email,
    fullName: payload.fullName,
    role: payload.role,
    roleTitle: roleTitleMap[payload.role] ?? "Clinical Staff",
    initials: initials || "US",
    facilityName: "Metro GI Ambulatory Surgery Center",
    licenseNumber: payload.licenseNumber,
    npi: payload.npi,
    specialty: payload.specialty,
    careStage: payload.careStage,
    department: payload.department,
    dateOfBirth: payload.dateOfBirth,
    escortName: payload.escortName,
    escortPhone: payload.escortPhone,
  };

  return {
    user: newUser,
    token: `mock_jwt_signup_${newUser.id}`,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
}
