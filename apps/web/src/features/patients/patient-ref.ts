import { ageFromDob } from "@asc/clinical-rules";
import type { Patient, PatientRef } from "@asc/types";

/** Full patient → compact identity for `PatientBanner` (view-model only). */
export function patientRefOf(patient: Patient): PatientRef {
  const displayName = `${patient.firstName} ${patient.lastName}`;
  return {
    id: patient.id,
    mrn: patient.mrn,
    displayName,
    initials: `${patient.firstName[0] ?? ""}${patient.lastName[0] ?? ""}`.toUpperCase(),
    age: ageFromDob(patient.dateOfBirth),
    sex: patient.sex,
    dateOfBirth: patient.dateOfBirth,
  };
}

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatCents(cents: number | undefined): string {
  return cents === undefined ? "—" : USD.format(cents / 100);
}
