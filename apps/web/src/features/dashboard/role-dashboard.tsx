import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

/** PLACEHOLDER — owner D replaces this with the real screen (docs/product/07-mock-frontend.md §4, §7). */
export function RoleDashboard() {
  return (
    <ScreenPlaceholder
      title="Dashboard"
      description="Your day at a glance: cases, queues and alerts for your role."
      owner="D"
    />
  );
}
