import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

interface NoteTabProps {
  readonly caseId: string;
}

/** PLACEHOLDER — owner C builds this tab. Data: useCase(caseId) from @asc/api-client/react (cached by the workspace). */
export function NoteTab({ caseId }: NoteTabProps) {
  return (
    <div data-testid="case-tab-note" data-case-id={caseId}>
      <ScreenPlaceholder
        embedded
        title="Procedure note"
        description="Generate → streaming sections → draft review (gaps, provenance, critic) → sign."
        owner="C"
      />
    </div>
  );
}
