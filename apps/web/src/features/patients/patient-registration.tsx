import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

/** PLACEHOLDER — owner A replaces this with the real screen (docs/product/07-mock-frontend.md §4, §7). */
export function PatientRegistration() {
  return (
    <ScreenPlaceholder
      title="Register patient"
      description="Demographics, duplicate check, coverage + eligibility (270/271) and escort."
      owner="A"
    />
  );
}
