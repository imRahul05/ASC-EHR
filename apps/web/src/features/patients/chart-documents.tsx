"use client";

import Link from "next/link";
import { useAuditLog, useReferrals } from "@asc/api-client/react";
import { formatDate, formatDateTime } from "@asc/clinical-rules/time";
import type { AuditEvent, Patient } from "@asc/types";
import { EmptyState, ErrorState, LoadingSkeleton, SectionCard, Timeline, type TimelineItem } from "@asc/ui";
import { FileText, History, ScrollText, UserPlus } from "@asc/ui/icons";

interface ChartDocumentsProps {
  readonly patient: Patient;
}

function timelineItem(event: AuditEvent): TimelineItem {
  return {
    id: event.id,
    at: event.at,
    title: event.summary,
    description: `${formatDate(event.at)} · ${event.actor.name} · ${event.action}`,
    icon: ScrollText,
    tone: event.outcome === "success" ? "default" : "destructive",
  };
}

/** Documents (faxed referrals) and the patient's audit trail. */
export function ChartDocuments({ patient }: ChartDocumentsProps) {
  const referrals = useReferrals();
  const audit = useAuditLog({ entityId: patient.id });
  const documents = (referrals.data ?? []).filter((referral) => referral.patientId === patient.id);
  const events: readonly TimelineItem[] = [
    ...(audit.data ?? []).map(timelineItem),
    { id: "registered", at: patient.createdAt, title: "Chart created", description: formatDate(patient.createdAt), icon: UserPlus, tone: "primary" },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="chart-documents">
      <SectionCard title="Documents" description="Faxed referrals and outside records.">
        {referrals.isPending && <LoadingSkeleton variant="table" rows={2} />}
        {referrals.isError && <ErrorState title="Could not load documents" onRetry={() => void referrals.refetch()} />}
        {referrals.data && documents.length === 0 && (
          <EmptyState icon={FileText} title="No documents" description="Referrals linked to this chart appear here." className="border-0 py-6" />
        )}
        {documents.length > 0 && (
          <ul className="divide-y divide-border">
            {documents.map((referral) => (
              <li key={referral.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2.5">
                  <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">Referral — {referral.fromPractice}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      Fax · {referral.pageCount} p · {formatDateTime(referral.receivedAt)}
                    </span>
                  </span>
                </span>
                <Link href="/referrals" className="shrink-0 text-xs font-medium text-primary hover:underline">
                  Open inbox
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard title="Timeline" description="Audit trail for this chart (who did what, when).">
        {audit.isPending && <LoadingSkeleton variant="table" rows={3} />}
        {audit.isError && <ErrorState title="Could not load the timeline" onRetry={() => void audit.refetch()} />}
        {audit.data && (events.length > 0 ? <Timeline items={events} /> : <EmptyState icon={History} title="No activity yet" className="border-0 py-6" />)}
      </SectionCard>
    </div>
  );
}
