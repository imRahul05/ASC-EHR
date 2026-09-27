import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

/** PLACEHOLDER — owner D replaces this with the real screen (docs/product/07-mock-frontend.md §4, §7). */
export function PathologyQueue() {
  return (
    <ScreenPlaceholder
      title="Pathology"
      description="Pending and received results across cases."
      owner="D"
    />
  );
}
