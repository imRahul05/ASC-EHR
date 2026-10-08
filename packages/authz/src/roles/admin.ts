import type { RoleTemplate } from "@asc/types";
import { REFERENCE_WRITE, ro, rw } from "@asc/authz/roles/rules";

// All-site role. No clinical-note access: administration is not care.
export const admin: RoleTemplate = {
  key: "admin",
  // v2: PractitionerRole (role grants) became read-only.
  version: 2,
  label: "Administrator",
  status: "active",
  capabilities: [
    "patient.read",
    "patient.register",
    "schedule.read",
    "schedule.manage",
    "admin.users",
    "admin.roles",
    "admin.facility",
    "audit.read",
    "case.read",
    "whiteboard.read",
    "patient.merge",
    "patient.eligibility.check",
    "case.cancel",
    "quality.read",
  ],
  data: [
    rw("Patient"),
    rw("Coverage"),
    rw("Appointment"),
    // Read-only case view for scheduling; no clinical documents.
    ro("Encounter"),
    ro("AuditEvent"),
    ...REFERENCE_WRITE,
  ],
  facilityScoped: false,
  requiresMfa: true,
};
