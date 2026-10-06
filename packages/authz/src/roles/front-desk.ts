import type { RoleTemplate } from "@asc/types";
import { rw } from "./rules.js";

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
  ],
  // No Composition: front desk never sees clinical notes.
  data: [rw("Patient"), rw("Coverage"), rw("Appointment"), rw("Encounter")],
  facilityScoped: true,
  requiresMfa: true,
};
