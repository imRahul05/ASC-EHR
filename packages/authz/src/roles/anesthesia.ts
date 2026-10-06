import type { RoleTemplate } from "@asc/types";
import { REFERENCE_READ, ro, rw } from "./rules.js";

// MD and CRNA share this role; the practitioner's qualification tells them
// apart, and a workflow rule can require an MD co-sign (08 §7.3).
export const anesthesia: RoleTemplate = {
  key: "anesthesia",
  version: 1,
  label: "Anesthesia provider",
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
    "anesthesia.document",
    "note.sign",
    "pacu.document",
    "discharge.approve",
    "breakglass.invoke",
    "note.edit",
    "note.addend",
    "consent.witness",
    "timeout.participate",
    "ai.generate",
  ],
  data: [
    ro("Patient"),
    ro("Coverage"),
    ro("Appointment"),
    rw("Encounter"),
    rw("QuestionnaireResponse"),
    ro("Composition"),
    rw("MedicationAdministration"),
    rw("Observation"),
    ...REFERENCE_READ,
    rw("Task"),
    rw("Consent"),
    ro("Procedure"),
  ],
  facilityScoped: true,
  requiresMfa: true,
};
