import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

interface PreProcedureTabProps {
  readonly caseId: string;
}

/** PLACEHOLDER — owner B builds this tab. Data: useCase(caseId) from @asc/api-client/react (cached by the workspace). */
export function PreProcedureTab({ caseId }: PreProcedureTabProps) {
  return (
    <div data-testid="case-tab-pre-procedure" data-case-id={caseId}>
      <ScreenPlaceholder
        embedded
        title="Pre-procedure"
        description="H&P with AI pre-visit brief, medication holds, allergies, ASA / Mallampati."
        owner="B"
      />
    </div>
  );
}
