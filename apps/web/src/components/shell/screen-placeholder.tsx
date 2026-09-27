import { EmptyState, PageHeader } from "@asc/ui";
import { Hammer } from "@asc/ui/icons";

interface ScreenPlaceholderProps {
  readonly title: string;
  readonly description: string;
  /** Feature owner from docs/product/07-mock-frontend.md §4 (A/B/C/D). */
  readonly owner: "A" | "B" | "C" | "D";
  /** Render without the page header (e.g. inside a case tab). */
  readonly embedded?: boolean;
}

/** Temporary screen body until the owning feature agent builds it. Delete the usage when replacing. */
export function ScreenPlaceholder({ title, description, owner, embedded = false }: ScreenPlaceholderProps) {
  return (
    <div className="space-y-6" data-testid="screen-placeholder">
      {!embedded && <PageHeader title={title} description={description} />}
      <EmptyState
        icon={Hammer}
        title="Coming in this build"
        description={embedded ? `${title} — ${description} (owner ${owner})` : `This screen is being built by feature owner ${owner}.`}
      />
    </div>
  );
}
