import type { RoleTemplate } from "@asc/types";
import { REFERENCE_READ, ro, rw } from "./rules";

// All-site role: coders work across facilities.
export const coder: RoleTemplate = {
  key: "coder",
  version: 1,
  label: "Medical coder",
  status: "active",
  // ai.generate: AI coding suggestions (P22).
  capabilities: ["patient.read", "case.read", "coding.review", "coding.attest", "charge.export", "ai.generate"],
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
    ...REFERENCE_READ,
    rw("Task"),
    ro("Procedure"),
    ro("DiagnosticReport"),
  ],
  facilityScoped: false,
  requiresMfa: true,
};
