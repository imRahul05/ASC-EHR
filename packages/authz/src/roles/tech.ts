import type { RoleTemplate } from "@asc/types";
import { ro, rw } from "./rules.js";

export const tech: RoleTemplate = {
  key: "tech",
  version: 1,
  label: "Endoscopy technician",
  status: "active",
  capabilities: [
    "patient.read",
    "schedule.read",
    "whiteboard.read",
    "case.read",
    "procedure.document",
    "specimen.manage",
  ],
  data: [
    ro("Patient"),
    ro("Coverage"),
    ro("Appointment"),
    rw("Encounter"),
    rw("QuestionnaireResponse"),
    ro("Composition"),
    ro("MedicationAdministration"),
    ro("Observation"),
  ],
  facilityScoped: true,
  requiresMfa: true,
};
