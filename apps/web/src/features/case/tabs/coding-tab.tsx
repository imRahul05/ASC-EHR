import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

interface CodingTabProps {
  readonly caseId: string;
}

/** PLACEHOLDER — owner D builds this tab. Data: useCase(caseId) from @asc/api-client/react (cached by the workspace). */
export function CodingTab({ caseId }: CodingTabProps) {
  return (
    <div data-testid="case-tab-coding" data-case-id={caseId}>
      <ScreenPlaceholder
        embedded
        title="Coding"
        description="CPT / ICD-10 / modifier suggestions with evidence, attest, charge export."
        owner="D"
      />
    </div>
  );
}
