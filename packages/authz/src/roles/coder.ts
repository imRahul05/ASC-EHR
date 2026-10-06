import type { RoleTemplate } from "@asc/types";
import { ro, rw } from "./rules.js";

// All-site role: coders work across facilities.
export const coder: RoleTemplate = {
  key: "coder",
  version: 1,
  label: "Medical coder",
  status: "active",
  capabilities: ["patient.read", "case.read", "coding.review", "coding.attest", "charge.export"],
  data: [
    ro("Patient"),
    ro("Coverage"),
    ro("Appointment"),
    ro("Encounter"),
    ro("QuestionnaireResponse"),
    ro("Composition"),
    ro("MedicationAdministration"),
    ro("Observation"),
    rw("ChargeItem"),
  ],
  facilityScoped: false,
  requiresMfa: true,
};
