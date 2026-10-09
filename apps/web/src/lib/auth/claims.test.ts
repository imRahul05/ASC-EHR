import { describe, expect, it } from "vitest";
import type { MeResponse } from "@asc/validation/authz";
import { buildUserProfileFromSession, parseIdTokenClaims } from "./claims";

const mockMe: MeResponse = {
  principal: {
    kind: "staff",
    id: "practitioner-123",
    membershipId: "mem-456",
    tenant: { tenantId: "t1", medplumProjectId: "p1" },
    grants: [
      {
        scope: "facility",
        facilityId: "fac-1",
        roleKeys: ["gi-physician"],
        capabilities: ["note.sign"],
      },
    ],
  },
  facilities: [{ id: "fac-1", name: "Metro Surgery Center" }],
};

describe("claims parser and profile builder", () => {
  it("parses valid JWT id_token payload", () => {
    // header: {"alg":"RS256"}
    // payload: {"sub":"user-1","email":"sarah@hospital.org","name":"Dr. Sarah Jenkins"}
    const header = btoa(JSON.stringify({ alg: "RS256" })).replace(/=+$/, "");
    const payload = btoa(
      JSON.stringify({
        sub: "user-1",
        email: "sarah@hospital.org",
        name: "Dr. Sarah Jenkins",
      }),
    ).replace(/=+$/, "");
    const token = `${header}.${payload}.mock-signature`;

    const claims = parseIdTokenClaims(token);
    expect(claims?.email).toBe("sarah@hospital.org");
    expect(claims?.name).toBe("Dr. Sarah Jenkins");
  });

  it("parses UTF-8 encoded non-ASCII clinician names correctly", () => {
    const header = Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: "user-utf8",
        email: "jose@hospital.org",
        name: "Dr. José Müller",
      }),
    ).toString("base64url");
    const token = `${header}.${payload}.mock-sig`;

    const claims = parseIdTokenClaims(token);
    expect(claims?.email).toBe("jose@hospital.org");
    expect(claims?.name).toBe("Dr. José Müller");
  });

  it("builds user profile with actual clinician metadata from ID token", () => {
    const header = btoa(JSON.stringify({ alg: "RS256" })).replace(/=+$/, "");
    const payload = btoa(
      JSON.stringify({
        sub: "user-1",
        email: "sarah@hospital.org",
        name: "Dr. Sarah Jenkins",
      }),
    ).replace(/=+$/, "");
    const token = `${header}.${payload}.mock-signature`;

    const profile = buildUserProfileFromSession({
      me: mockMe,
      idToken: token,
    });

    expect(profile.id).toBe("practitioner-123");
    expect(profile.email).toBe("sarah@hospital.org");
    expect(profile.fullName).toBe("Dr. Sarah Jenkins");
    expect(profile.initials).toBe("DS");
    expect(profile.roleTitle).toBe("GI physician");
    expect(profile.facilityName).toBe("Metro Surgery Center");
  });

  it("falls back to email fallback when ID token is absent", () => {
    const profile = buildUserProfileFromSession({
      me: mockMe,
      emailFallback: "nurse.alex@hospital.org",
    });

    expect(profile.email).toBe("nurse.alex@hospital.org");
    expect(profile.fullName).toBe("nurse.alex");
    expect(profile.initials).toBe("NU");
    expect(profile.roleTitle).toBe("GI physician");
    expect(profile.facilityName).toBe("Metro Surgery Center");
  });
});
