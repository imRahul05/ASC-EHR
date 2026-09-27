import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

interface PathologyTabProps {
  readonly caseId: string;
}

/** PLACEHOLDER — owner D builds this tab. Data: useCase(caseId) from @asc/api-client/react (cached by the workspace). */
export function PathologyTab({ caseId }: PathologyTabProps) {
  return (
    <div data-testid="case-tab-pathology" data-case-id={caseId}>
      <ScreenPlaceholder
        embedded
        title="Pathology"
        description="Results → polyp reconcile, adenoma flag, surveillance interval, letters."
        owner="D"
      />
    </div>
  );
}
