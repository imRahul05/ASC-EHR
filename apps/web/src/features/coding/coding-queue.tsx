import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

/** PLACEHOLDER — owner D replaces this with the real screen (docs/product/07-mock-frontend.md §4, §7). */
export function CodingQueue() {
  return (
    <ScreenPlaceholder
      title="Coding"
      description="Cases ready for coding review, attestation and charge export."
      owner="D"
    />
  );
}
