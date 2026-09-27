import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

/** PLACEHOLDER — owner A replaces this with the real screen (docs/product/07-mock-frontend.md §4, §7). */
export function PatientList() {
  return (
    <ScreenPlaceholder
      title="Patients"
      description="Search and open patient charts; register new patients."
      owner="A"
    />
  );
}
