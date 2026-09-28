"use client";

import Link from "next/link";
import { useWhiteboard } from "@asc/api-client/react";
import { isPhaseAtLeast } from "@asc/clinical-rules";
import type { WhiteboardCard } from "@asc/types";
import { EmptyState, ErrorState, LoadingSkeleton, SectionCard } from "@asc/ui";
import { BadgeCheck, CreditCard, Pill, ShieldAlert, UserX, type LucideIcon } from "@asc/ui/icons";

type Flag = WhiteboardCard["flags"][number];

/** Flag → icon, message and the tab where it is fixed (colour is never the only signal). */
const FLAG_ALERT: Readonly<Record<Flag, { readonly icon: LucideIcon; readonly text: string; readonly tab: string; readonly tone: string }>> = {
  eligibility: { icon: CreditCard, text: "Eligibility not active", tab: "pre-procedure", tone: "text-destructive" },
  escort_missing: { icon: UserX, text: "Escort not confirmed", tab: "pre-op", tone: "text-warning" },
  anticoagulant: { icon: Pill, text: "Anticoagulant / antiplatelet — check hold", tab: "pre-procedure", tone: "text-warning" },
  allergy: { icon: ShieldAlert, text: "Allergy on file", tab: "pre-procedure", tone: "text-info" },
};
/** Allergies are shown on every banner; only raise the ones that can still block the day. */
const ALERT_FLAGS: readonly Flag[] = ["eligibility", "escort_missing", "anticoagulant"];

/** Today's blocking flags from the live board (case # + initials only), linking to where they are fixed. */
export function AlertsPanel() {
  const board = useWhiteboard();
  const alerts = (board.data?.cards ?? [])
    .filter((card) => !isPhaseAtLeast(card.phase, "IN_PROCEDURE") && card.phase !== "CANCELLED" && card.phase !== "NO_SHOW")
    .flatMap((card) => card.flags.filter((flag) => ALERT_FLAGS.includes(flag)).map((flag) => ({ card, flag })));

  return (
    <SectionCard title="Alerts" description="Pre-procedure blockers for today" contentClassName="p-2" data-testid="dashboard-alerts">
      {board.isPending && <LoadingSkeleton variant="table" rows={3} />}
      {board.isError && <ErrorState message="Could not load alerts." onRetry={() => void board.refetch()} />}
      {board.isSuccess && alerts.length === 0 && <EmptyState icon={BadgeCheck} title="No blockers" description="Every upcoming case is clear." className="py-8" />}
      {alerts.length > 0 && (
        <ul className="divide-y divide-border/60">
          {alerts.map(({ card, flag }) => {
            const { icon: Icon, text, tab, tone } = FLAG_ALERT[flag];
            return (
              <li key={`${card.caseId}-${flag}`}>
                <Link
                  href={`/cases/${card.caseId}?tab=${tab}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/40"
                >
                  <Icon className={`size-4 shrink-0 ${tone}`} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm">{text}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    <span className="font-mono">{card.caseNumber}</span> · {card.initials}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
