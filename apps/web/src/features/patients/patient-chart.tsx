import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

interface PatientChartProps {
  readonly patientId: string;
}

/** PLACEHOLDER — owner A replaces this with the real screen (docs/product/07-mock-frontend.md §4, §7). Data: usePatient(patientId). */
export function PatientChart({ patientId }: PatientChartProps) {
  return (
    <div data-patient-id={patientId}>
      <ScreenPlaceholder title="Patient chart" description="Demographics, coverage, meds and allergies, cases." owner="A" />
    </div>
  );
}
