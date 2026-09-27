import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

/** PLACEHOLDER — owner D replaces this with the real screen (docs/product/07-mock-frontend.md §4, §7). */
export function AuditLog() {
  return (
    <ScreenPlaceholder
      title="Audit log"
      description="Every command, sign-off and AI action with filters."
      owner="D"
    />
  );
}
