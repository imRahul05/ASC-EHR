import type { RoleTemplate } from "@asc/types";
import { ro, rw } from "./rules.js";

export const rn: RoleTemplate = {
  key: "rn",
  version: 1,
  label: "Registered nurse",
  status: "active",
  capabilities: [
    "patient.read",
    "schedule.read",
    "whiteboard.read",
    "case.read",
    "case.advance",
    "hp.document",
    "medhold.review",
    "consent.collect",
    "procedure.document",
    "specimen.manage",
    "pacu.document",
    "discharge.approve",
    "pathology.reconcile",
    "breakglass.invoke",
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
