import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

/** PLACEHOLDER — owner A replaces this with the real screen (docs/product/07-mock-frontend.md §4, §7). */
export function ScheduleBoard() {
  return (
    <ScreenPlaceholder
      title="Schedule"
      description="Day board by room with booking, conflict check and eligibility."
      owner="A"
    />
  );
}
