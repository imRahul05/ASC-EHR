import { ALL_PHASES, PHASE_GROUP, PHASE_LABEL } from "@asc/clinical-rules";
import type { PhaseGroup, ProcedureCase } from "@asc/types";
import { PHASE_GROUP_ICON, SectionCard, Timeline, type TimelineItem } from "@asc/ui";

const TONE_BY_GROUP: Readonly<Record<PhaseGroup, NonNullable<TimelineItem["tone"]>>> = {
  scheduling: "default",
  dayof: "primary",
  procedure: "ai",
  recovery: "warning",
  post: "success",
  stopped: "destructive",
};

interface PhaseHistoryProps {
  readonly procedureCase: ProcedureCase;
}

/** When the case entered each phase (newest first). */
export function PhaseHistory({ procedureCase }: PhaseHistoryProps) {
  const items: TimelineItem[] = ALL_PHASES.flatMap((phase) => {
    const at = procedureCase.timestamps[phase];
    return at
      ? [{ id: phase, at, title: PHASE_LABEL[phase], icon: PHASE_GROUP_ICON[PHASE_GROUP[phase]], tone: TONE_BY_GROUP[PHASE_GROUP[phase]] }]
      : [];
  })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return (
    <SectionCard title="Phase history" data-testid="case-phase-history">
      <Timeline items={items} />
    </SectionCard>
  );
}
