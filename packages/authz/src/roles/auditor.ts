import type { RoleTemplate } from "@asc/types";
import { REFERENCE_READ, ro } from "./rules.js";

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
    ...REFERENCE_READ,
    ro("Task"),
    ro("Consent"),
    ro("Procedure"),
    ro("Specimen"),
    ro("DiagnosticReport"),
    ro("DocumentReference"),
    ro("ServiceRequest"),
  ],
  facilityScoped: false,
  requiresMfa: true,
};
