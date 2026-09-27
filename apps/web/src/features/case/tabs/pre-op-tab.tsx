import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

interface PreOpTabProps {
  readonly caseId: string;
}

/** PLACEHOLDER — owner B builds this tab. Data: useCase(caseId) from @asc/api-client/react (cached by the workspace). */
export function PreOpTab({ caseId }: PreOpTabProps) {
  return (
    <div data-testid="case-tab-pre-op" data-case-id={caseId}>
      <ScreenPlaceholder
        embedded
        title="Pre-op"
        description="Check-in, vitals, IV, NPO, consents with signature, readiness gate."
        owner="B"
      />
    </div>
  );
}
