"use client";

import Link from "next/link";
import { useWhiteboard } from "@asc/api-client/react";
import { PHASE_GROUP, PHASE_GROUP_LABEL, PHASE_GROUP_ORDER } from "@asc/clinical-rules";
import { formatTime24 } from "@asc/clinical-rules/time";
import type { CasePhase, PhaseGroup } from "@asc/types";
import { EmptyState, ErrorState, LoadingSkeleton, PHASE_GROUP_CLASS, PHASE_GROUP_ICON, PhaseChip, SectionCard } from "@asc/ui";
import { ArrowRight, Coffee } from "@asc/ui/icons";

/** What the nurse does next per phase, and on which tab. Phases without an entry need no nursing action. */
const NEXT_ACTION: Partial<Record<CasePhase, { readonly text: string; readonly tab: string }>> = {
  CONFIRMED: { text: "Check in on arrival", tab: "pre-op" },
  ARRIVED: { text: "Start pre-op: vitals, IV, consents", tab: "pre-op" },
  PRE_OP: { text: "Clear the readiness gate", tab: "pre-op" },
  READY_FOR_PROCEDURE: { text: "Run the time-out", tab: "procedure" },
  RECOVERY: { text: "PACU vitals + Aldrete", tab: "recovery" },
  READY_FOR_DISCHARGE: { text: "Approve instructions and discharge", tab: "recovery" },
};
const GROUPS: readonly PhaseGroup[] = PHASE_GROUP_ORDER.filter((group) => group !== "stopped");

/** Nurse view: today's cases per phase group and the next action on each case. */
export function NurseFlowPanel() {
  const board = useWhiteboard();
  const cards = board.data?.cards ?? [];
  const counts = cards.reduce<Partial<Record<PhaseGroup, number>>>((acc, card) => {
    const group = PHASE_GROUP[card.phase];
    return { ...acc, [group]: (acc[group] ?? 0) + 1 };
  }, {});
  const actions = cards.flatMap((card) => {
    const next = NEXT_ACTION[card.phase];
    return next ? [{ card, next }] : [];
  });

  return (
    <SectionCard title="Unit flow" description="Today by phase, and what's next" data-testid="dashboard-nurse-flow">
      {board.isPending && <LoadingSkeleton variant="cards" />}
      {board.isError && <ErrorState message="Could not load the board." onRetry={() => void board.refetch()} />}
      {board.isSuccess && (
        <div className="space-y-4">
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Cases by phase">
            {GROUPS.map((group) => {
              const Icon = PHASE_GROUP_ICON[group];
              return (
                <li key={group} className={`rounded-lg px-3 py-2 ${PHASE_GROUP_CLASS[group]}`} data-testid={`dashboard-phase-${group}`}>
                  <p className="flex items-center gap-1 text-xs font-medium">
                    <Icon className="size-3.5" aria-hidden /> {PHASE_GROUP_LABEL[group]}
                  </p>
                  <p className="text-xl font-semibold tabular-nums">{counts[group] ?? 0}</p>
                </li>
              );
            })}
          </ul>
          {actions.length === 0 ? (
            <EmptyState icon={Coffee} title="No nursing actions right now" description="New arrivals will show here." className="py-6" />
          ) : (
            <ul className="divide-y divide-border/60" aria-label="Next actions">
              {actions.map(({ card, next }) => (
                <li key={card.caseId}>
                  <Link
                    href={`/cases/${card.caseId}?tab=${next.tab}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/40"
                    data-testid={`dashboard-next-${card.caseId}`}
                  >
                    <span className="w-12 shrink-0 text-sm tabular-nums">{formatTime24(card.scheduledStart)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{next.text}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        <span className="font-mono">{card.caseNumber}</span> · {card.initials} · {card.roomId.replace("room-", "Room ")}
                      </span>
                    </span>
                    <PhaseChip phase={card.phase} />
                    <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </SectionCard>
  );
}
