import type { RoleAssignment } from "@asc/authz/grants";
import type { TenantRef } from "@asc/types";

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
