import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

/** PLACEHOLDER — owner D replaces this with the real screen (docs/product/07-mock-frontend.md §4, §7). */
export function WorklistView() {
  return (
    <ScreenPlaceholder
      title="Worklist"
      description="Tasks by type: sign queue, eligibility, referrals, pathology, coding."
      owner="D"
    />
  );
}
