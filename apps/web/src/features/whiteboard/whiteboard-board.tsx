import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

/** PLACEHOLDER — owner B replaces this with the real screen (docs/product/07-mock-frontend.md §4, §7). */
export function WhiteboardBoard() {
  return (
    <ScreenPlaceholder
      title="Whiteboard"
      description="Live board by phase (initials + case number only) and room status."
      owner="B"
    />
  );
}
