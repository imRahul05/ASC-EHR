import type { UserProfile } from "@asc/types";
import type { MeResponse } from "@asc/validation/authz";
import { roleLabelsFor } from "../role-labels";

interface IdTokenClaims {
  readonly sub?: string;
  readonly email?: string;
  readonly name?: string;
  readonly given_name?: string;
  readonly family_name?: string;
}

export function parseIdTokenClaims(idToken: string | undefined): IdTokenClaims | null {
  if (idToken === undefined || idToken.length === 0) return null;
  try {
    const parts = idToken.split(".");
    if (parts.length < 2 || parts[1] === undefined) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as IdTokenClaims;
  } catch {
    return null;
  }
}

function computeInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length >= 2) {
    const first = parts[0]?.[0];
    const second = parts[1]?.[0];
    if (first !== undefined && second !== undefined) {
      return (first + second).toUpperCase();
    }
  }
  return fullName.slice(0, 2).toUpperCase();
}

export function buildUserProfileFromSession(params: {
  readonly me: MeResponse;
  readonly idToken?: string;
  readonly emailFallback?: string;
}): UserProfile {
  const { me, idToken, emailFallback } = params;
  const claims = parseIdTokenClaims(idToken);

  const email =
    claims?.email ??
    emailFallback ??
    (me.principal.id.includes("@") ? me.principal.id : "staff@center.org");

  let fullName = claims?.name;
  if (!fullName && claims?.given_name && claims?.family_name) {
    fullName = `${claims.given_name} ${claims.family_name}`;
  }
  if (!fullName) {
    fullName = email.includes("@") ? (email.split("@")[0] ?? "Staff Member") : "Staff Member";
  }

  const facilityId = me.facilities[0]?.id ?? null;
  const roles = roleLabelsFor(me.principal, facilityId);
  const roleTitle = roles[0] ?? "Staff";
  const facilityName = me.facilities[0]?.name ?? "Main Center";
  const initials = computeInitials(fullName);

  return {
    id: me.principal.id,
    email,
    fullName,
    roleTitle,
    initials,
    facilityName,
  };
}
