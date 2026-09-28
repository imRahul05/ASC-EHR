import type { Metadata } from "next";
import { PatientList } from "@/features/patients/patient-list";

export const metadata: Metadata = { title: "Patients" };

export default function PatientsPage() {
  return <PatientList />;
}
