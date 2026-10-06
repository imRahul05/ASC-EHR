import type { RoleTemplate } from "@asc/types";
import { REFERENCE_READ, ro, rw } from "./rules";

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
    "timeout.participate",
    "image.manage",
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
    ...REFERENCE_READ,
    rw("Task"),
    rw("Procedure"),
    rw("Specimen"),
    rw("DocumentReference"),
  ],
  facilityScoped: true,
  requiresMfa: true,
};
