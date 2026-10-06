import type { RoleTemplate } from "@asc/types";
import { ro } from "./rules.js";

// All-site, read-only everywhere.
export const auditor: RoleTemplate = {
  key: "auditor",
  version: 1,
  label: "Auditor",
  status: "active",
  capabilities: ["patient.read", "case.read", "audit.read"],
  data: [
    ro("Patient"),
    ro("Coverage"),
    ro("Appointment"),
    ro("Encounter"),
    ro("QuestionnaireResponse"),
    ro("Composition"),
    ro("MedicationAdministration"),
    ro("Observation"),
    ro("ChargeItem"),
    ro("AuditEvent"),
  ],
  facilityScoped: false,
  requiresMfa: true,
};
