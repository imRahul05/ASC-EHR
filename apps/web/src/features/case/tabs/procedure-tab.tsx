import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

interface ProcedureTabProps {
  readonly caseId: string;
}

/** PLACEHOLDER — owner C builds this tab. Data: useCase(caseId) from @asc/api-client/react (cached by the workspace). */
export function ProcedureTab({ caseId }: ProcedureTabProps) {
  return (
    <div data-testid="case-tab-procedure" data-case-id={caseId}>
      <ScreenPlaceholder
        embedded
        title="Procedure"
        description="Room mode: time-out, event taps with timer, narration, specimens, images."
        owner="C"
      />
    </div>
  );
}
