import type { RoleTemplate } from "@asc/types";
import { REFERENCE_READ, rw } from "@asc/authz/roles/rules";

export const frontDesk: RoleTemplate = {
  key: "front-desk",
  version: 1,
  label: "Front desk",
  status: "active",
  capabilities: [
    "patient.read",
    "patient.register",
    "schedule.read",
    "schedule.manage",
    "whiteboard.read",
    "case.read",
    "case.advance",
    "consent.collect",
    "patient.eligibility.check",
    "case.cancel",
    "fax.send",
  ],
  // No Composition: front desk never sees clinical notes.
  data: [
    rw("Patient"),
    rw("Coverage"),
    rw("Appointment"),
    rw("Encounter"),
    ...REFERENCE_READ,
    rw("Task"),
    rw("Consent"),
    rw("DocumentReference"),
    rw("ServiceRequest"),
  ],
  facilityScoped: true,
  requiresMfa: true,
};
