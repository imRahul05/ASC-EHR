import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

/** PLACEHOLDER — owner D replaces this with the real screen (docs/product/07-mock-frontend.md §4, §7). */
export function QualityDashboard() {
  return (
    <ScreenPlaceholder
      title="Quality"
      description="ADR, cecal intubation, withdrawal time, prep quality, turnaround."
      owner="D"
    />
  );
}
