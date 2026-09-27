import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

interface AnesthesiaTabProps {
  readonly caseId: string;
}

/** PLACEHOLDER — owner C builds this tab. Data: useCase(caseId) from @asc/api-client/react (cached by the workspace). */
export function AnesthesiaTab({ caseId }: AnesthesiaTabProps) {
  return (
    <div data-testid="case-tab-anesthesia" data-case-id={caseId}>
      <ScreenPlaceholder
        embedded
        title="Anesthesia"
        description="AIMS flowsheet: 5-min vitals, drug doses, airway, sedation start/end."
        owner="C"
      />
    </div>
  );
}
