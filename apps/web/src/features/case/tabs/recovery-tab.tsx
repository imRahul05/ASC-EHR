import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

interface RecoveryTabProps {
  readonly caseId: string;
}

/** PLACEHOLDER — owner D builds this tab. Data: useCase(caseId) from @asc/api-client/react (cached by the workspace). */
export function RecoveryTab({ caseId }: RecoveryTabProps) {
  return (
    <div data-testid="case-tab-recovery" data-case-id={caseId}>
      <ScreenPlaceholder
        embedded
        title="Recovery"
        description="PACU vitals, Aldrete, discharge gate, AI discharge instructions, discharge."
        owner="D"
      />
    </div>
  );
}
