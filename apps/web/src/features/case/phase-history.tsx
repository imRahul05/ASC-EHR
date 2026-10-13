import { ALL_STAGES, LEGACY_ALL_PHASES, STAGE_FROM_PHASE, PHASE_GROUP, PHASE_LABEL } from "@asc/clinical-rules";
import type { CasePhase, CaseStage, PhaseGroup, ProcedureCase } from "@asc/types";
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
  const stageEntries = ALL_STAGES.flatMap((stage: CaseStage) => {
    const at = procedureCase.stageTimestamps?.[stage];
    return at
      ? [{ id: stage, at, title: PHASE_LABEL[stage], icon: PHASE_GROUP_ICON[PHASE_GROUP[stage]], tone: TONE_BY_GROUP[PHASE_GROUP[stage]] }]
      : [];
  });

  const legacyEntries = LEGACY_ALL_PHASES.flatMap((phase: CasePhase) => {
    const at = procedureCase.timestamps[phase];
    if (!at) return [];
    const mappedStage = STAGE_FROM_PHASE[phase];
    if (mappedStage && procedureCase.stageTimestamps?.[mappedStage]) {
      return [];
    }
    return [{ id: phase, at, title: PHASE_LABEL[phase], icon: PHASE_GROUP_ICON[PHASE_GROUP[phase]], tone: TONE_BY_GROUP[PHASE_GROUP[phase]] }];
  });

  const items: TimelineItem[] = [...stageEntries, ...legacyEntries]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return (
    <SectionCard title="Phase history" data-testid="case-phase-history">
      <Timeline items={items} />
    </SectionCard>
  );
}
