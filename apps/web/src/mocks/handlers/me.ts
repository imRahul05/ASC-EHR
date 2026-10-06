import { buildGrants, roleRegistry } from "@asc/authz";
import { API_ROUTES } from "@asc/config/api";
import type { Principal } from "@asc/types";
import { http, HttpResponse } from "msw";
import { DEMO_FACILITIES, DEMO_IDENTITIES, DEMO_TENANT } from "../data/identities";
import { MOCK_USER_PROFILES } from "../data/users";
import { emailForAuthorization } from "../db/sessions";
import { apiUrl } from "./api-url";

/** The Principal and facility names for a demo user, built from role assignments by @asc/authz. */
export function meFor(email: string) {
  const identity = Object.hasOwn(DEMO_IDENTITIES, email) ? DEMO_IDENTITIES[email] : undefined;
  const profile = Object.hasOwn(MOCK_USER_PROFILES, email) ? MOCK_USER_PROFILES[email] : undefined;
  if (identity === undefined || profile === undefined) return undefined;

  const grants = buildGrants(identity.assignments, roleRegistry);
  const base = { id: profile.id, tenant: DEMO_TENANT, grants };
  const principal: Principal =
    identity.patientId === undefined
      ? { ...base, kind: "staff", membershipId: `membership-${profile.id}` }
      : { ...base, kind: "patient", patientId: identity.patientId };

  const facilityIds = new Set(grants.flatMap((grant) => (grant.scope === "facility" ? [grant.facilityId] : [])));
  return { principal, facilities: DEMO_FACILITIES.filter((facility) => facilityIds.has(facility.id)) };
}

export function resolveMe(authorization: string | null) {
  const email = emailForAuthorization(authorization);
  const me = email === undefined ? undefined : meFor(email);
  return me === undefined ? { status: 401 as const } : { status: 200 as const, body: me };
}

export const meHandlers = [
  http.get(apiUrl(API_ROUTES.me), ({ request }) => {
    const result = resolveMe(request.headers.get("Authorization"));
    if (result.status === 401) return HttpResponse.json({ message: "Not signed in", code: "AUTH_REQUIRED" }, { status: 401 });
    return HttpResponse.json(result.body);
  }),
];
