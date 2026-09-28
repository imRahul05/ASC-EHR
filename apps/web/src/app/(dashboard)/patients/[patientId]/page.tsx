import type { Metadata } from "next";
import { PatientChart } from "@/features/patients/patient-chart";

// Title never contains PHI — ids only in the URL.
export const metadata: Metadata = { title: "Patient chart" };

interface PatientsPatientIdPageProps {
  readonly params: Promise<{ patientId: string }>;
}

export default async function PatientsPatientIdPage({ params }: PatientsPatientIdPageProps) {
  const { patientId } = await params;
  return <PatientChart patientId={patientId} />;
}
