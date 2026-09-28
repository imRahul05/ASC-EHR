"use client";

import { useState } from "react";
import { useReferrals } from "@asc/api-client/react";
import { formatDateTime } from "@asc/clinical-rules/time";
import type { Referral } from "@asc/types";
import {
  cn,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  OfflineBanner,
  PageHeader,
  SegmentedControl,
  Skeleton,
  StaleBadge,
  type SegmentedOption,
} from "@asc/ui";
import { FileText, Inbox } from "@asc/ui/icons";
import { factValue } from "./referral-prefill";
import { ReferralDetail } from "./referral-detail";
import { ReferralStatusChip } from "./referral-status-chip";

type InboxFilter = "open" | "converted" | "all";

const FILTERS: readonly SegmentedOption<InboxFilter>[] = [
  { value: "open", label: "Open" },
  { value: "converted", label: "Converted" },
  { value: "all", label: "All" },
];

const MATCHES: Readonly<Record<InboxFilter, (referral: Referral) => boolean>> = {
  open: (referral) => referral.status === "new" || referral.status === "in_review",
  converted: (referral) => referral.status === "converted",
  all: () => true,
};

/** Urgent first, then newest. */
function byPriority(a: Referral, b: Referral): number {
  if (a.priority !== b.priority) return a.priority === "urgent" ? -1 : 1;
  return Date.parse(b.receivedAt) - Date.parse(a.receivedAt);
}

/** `/referrals` — fax inbox: list on the left, document + AI-extracted facts on the right. */
export function ReferralInbox() {
  const query = useReferrals();
  const [filter, setFilter] = useState<InboxFilter>("open");
  const [chosenId, setChosenId] = useState<string | null>(null);

  const all = query.data ?? [];
  const rows = all.filter(MATCHES[filter]).toSorted(byPriority);
  const selected = all.find((referral) => referral.id === chosenId) ?? rows[0] ?? null;
  const openCount = all.filter(MATCHES.open).length;

  return (
    <div className="space-y-5" data-testid="referral-inbox">
      <PageHeader
        eyebrow="Front desk"
        title="Referrals"
        description="Faxed referrals, read by AI. Verify the extracted facts against the document, then create or link the patient."
        actions={<StaleBadge refreshing={query.isFetching && !query.isPending} stale={query.isRefetchError} />}
      />
      <OfflineBanner />

      {query.isError && !query.data ? (
        <ErrorState title="Could not load the inbox" message="Check your connection and try again." onRetry={() => void query.refetch()} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="space-y-3">
            <SegmentedControl size="sm" aria-label="Filter referrals" options={FILTERS} value={filter} onValueChange={setFilter} data-testid="referral-filter" />
            <p className="px-1 text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {query.isPending ? "Loading…" : `${openCount} open · ${all.length} total`}
            </p>
            <ul className="space-y-2" aria-label="Referrals">
              {query.isPending &&
                Array.from({ length: 4 }, (_, index) => (
                  <li key={index}>
                    <Skeleton className="h-[5.5rem] rounded-xl" />
                  </li>
                ))}
              {query.data && rows.length === 0 && (
                <li>
                  <EmptyState
                    icon={Inbox}
                    title={filter === "open" ? "Inbox zero" : "Nothing here"}
                    description={filter === "open" ? "New faxes appear here as they arrive." : "Try another filter."}
                  />
                </li>
              )}
              {rows.map((referral) => {
                const isSelected = selected?.id === referral.id;
                return (
                  <li key={referral.id}>
                    <button
                      type="button"
                      onClick={() => setChosenId(referral.id)}
                      aria-current={isSelected ? "true" : undefined}
                      className={cn(
                        "w-full space-y-1.5 rounded-xl border bg-card p-3 text-left shadow-xs outline-none transition-colors motion-reduce:transition-none",
                        "hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/40",
                        isSelected ? "border-primary/40 bg-accent/60" : "border-border",
                      )}
                      data-testid="referral-list-item"
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                          <span className="truncate text-sm font-semibold">{factValue(referral, "patientName") || "Unreadable name"}</span>
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{formatDateTime(referral.receivedAt)}</span>
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {referral.fromPractice} · {factValue(referral, "requestedProcedure")}
                      </span>
                      <ReferralStatusChip status={referral.status} priority={referral.priority} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <section aria-label="Referral detail" className="min-w-0">
            {query.isPending && <LoadingSkeleton variant="detail" />}
            {query.data && selected && <ReferralDetail referral={selected} />}
            {query.data && !selected && (
              <EmptyState icon={FileText} title="Select a referral" description="Pick a fax on the left to review its extracted facts." />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
