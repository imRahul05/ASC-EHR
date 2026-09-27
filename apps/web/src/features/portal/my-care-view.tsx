import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

/** PLACEHOLDER — owner D replaces this with the real screen (docs/product/07-mock-frontend.md §4, §7). */
export function MyCareView() {
  return (
    <ScreenPlaceholder
      title="My procedure"
      description="Your procedure, prep checklist, escort, instructions and results."
      owner="D"
    />
  );
}
