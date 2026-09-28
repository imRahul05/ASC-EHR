import type { Metadata } from "next";
import { PatientRegistration } from "@/features/patients/patient-registration";

export const metadata: Metadata = { title: "Register patient" };

export default function PatientsNewPage() {
  return <PatientRegistration />;
}
