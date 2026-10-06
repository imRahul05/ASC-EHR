import type { RoleTemplate } from "@asc/types";
import { ro, rw } from "./rules.js";

// All-site role. No clinical-note access: administration is not care.
export const admin: RoleTemplate = {
  key: "admin",
  version: 1,
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
  ],
  data: [rw("Patient"), rw("Coverage"), rw("Appointment"), ro("AuditEvent")],
  facilityScoped: false,
  requiresMfa: true,
};
