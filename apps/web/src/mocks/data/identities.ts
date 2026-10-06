import type { RoleAssignment } from "@asc/authz";
import type { TenantRef, UserRole } from "@asc/types";

// Demo identities: which roles each demo user holds, and where. Roles are data
// (templates in @asc/authz); the mock /me builds the Principal from these.
export const DEMO_TENANT: TenantRef = { tenantId: "tenant-demo", medplumProjectId: "project-demo" };

export const DEMO_FACILITIES = [
  { id: "fac-metro", name: "Metro GI Ambulatory Surgery Center" },
  { id: "fac-lakeside", name: "Lakeside Endoscopy Center" },
] as const;

const METRO = "fac-metro";
const LAKESIDE = "fac-lakeside";

interface DemoIdentity {
  readonly assignments: readonly RoleAssignment[];
  /** Set for portal users: the patient record they own. */
  readonly patientId?: string;
}

// Temporary: signup still asks for a legacy role. Removed with the role picker (P05d2).
// buildGrants ignores the facility for all-site roles, so every signup is placed at Metro.
const SIGNUP_ROLE: Readonly<Record<UserRole, { readonly roleKey: string; readonly portal: boolean }>> = {
  SURGEON: { roleKey: "gi-physician", portal: false },
  ANESTHESIOLOGIST: { roleKey: "anesthesia", portal: false },
  NURSE: { roleKey: "rn", portal: false },
  ADMIN: { roleKey: "admin", portal: false },
  PATIENT: { roleKey: "patient", portal: true },
};

export function signupIdentity(role: UserRole, userId: string): DemoIdentity {
  const { roleKey, portal } = SIGNUP_ROLE[role];
  return {
    assignments: [{ roleKey, facilityId: METRO }],
    ...(portal ? { patientId: `pat_${userId}` } : {}),
  };
}

/** Keyed by sign-in email. A user at two facilities holds separate grants at each. */
export const DEMO_IDENTITIES: Readonly<Record<string, DemoIdentity>> = {
  "surgeon@ascehr.demo": { assignments: [{ roleKey: "gi-physician", facilityId: METRO }] },
  "anesthesia@ascehr.demo": { assignments: [{ roleKey: "anesthesia", facilityId: METRO }] },
  "nurse@ascehr.demo": { assignments: [{ roleKey: "rn", facilityId: METRO }] },
  // The "Front desk & admin" persona: one person holding several roles, three of them all-site.
  "admin@ascehr.demo": {
    assignments: [
      { roleKey: "front-desk", facilityId: METRO },
      { roleKey: "admin" },
      { roleKey: "coder" },
      { roleKey: "auditor" },
    ],
  },
  "patient@ascehr.demo": { assignments: [{ roleKey: "patient" }], patientId: "pat_105" },
  // "User X": a nurse at Metro who works as a physician at Lakeside.
  "float@ascehr.demo": {
    assignments: [
      { roleKey: "rn", facilityId: METRO },
      { roleKey: "gi-physician", facilityId: LAKESIDE },
    ],
  },
};
