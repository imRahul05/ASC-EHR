"use client";

import { useRouter } from "next/navigation";
import { usePathologyQueue } from "@asc/api-client/react";
import { formatDate } from "@asc/clinical-rules/time";
import type { PathologyQueueItem } from "@asc/types";
import { Badge, DataTable, EmptyState, ErrorState, PageHeader, StatCard, type DataTableColumn } from "@asc/ui";
import { CircleCheck, FlaskConical, Hourglass, Microscope, type LucideIcon } from "@asc/ui/icons";

type QueueStatus = PathologyQueueItem["status"];

const STATUS: Readonly<Record<QueueStatus, { readonly label: string; readonly icon: LucideIcon; readonly className: string; readonly rank: number }>> = {
  awaiting: { label: "Awaiting lab", icon: Hourglass, className: "border-warning/30 bg-warning/10 text-warning", rank: 1 },
  received: { label: "Needs review", icon: FlaskConical, className: "border-info/30 bg-info/10 text-info", rank: 0 },
  reconciled: { label: "Reconciled", icon: CircleCheck, className: "border-success/30 bg-success/10 text-success", rank: 2 },
};
const STATUS_ORDER: readonly QueueStatus[] = ["received", "awaiting", "reconciled"];

const COLUMNS: readonly DataTableColumn<PathologyQueueItem>[] = [
  { id: "case", header: "Case", cell: (row) => <span className="font-mono text-sm">{row.caseNumber}</span> },
  {
    id: "patient",
    header: "Patient",
    cell: (row) => (
      <div>
        <p className="text-sm font-medium">{row.patient.displayName}</p>
        <p className="text-xs text-muted-foreground">
          {row.patient.age} y · {row.patient.sex}
        </p>
      </div>
    ),
  },
  { id: "date", header: "Procedure", cell: (row) => <span className="tabular-nums">{formatDate(row.procedureDate)}</span> },
  { id: "surgeon", header: "Surgeon", cell: (row) => row.surgeon.name },
  { id: "specimens", header: "Resulted", align: "right", cell: (row) => <span className="tabular-nums">{row.resultedCount}/{row.specimenCount}</span> },
  {
    id: "status",
    header: "Status",
    cell: (row) => {
      const { label, icon: Icon, className } = STATUS[row.status];
      return (
        <Badge variant="outline" className={className}>
          <Icon /> {label}
        </Badge>
      );
    },
  },
];

/** `/pathology` — results across cases: needs review first, then awaiting; each row opens the case pathology tab. */
export function PathologyQueue() {
  const router = useRouter();
  const queue = usePathologyQueue();
  const rows = [...(queue.data ?? [])].sort((a, b) => STATUS[a.status].rank - STATUS[b.status].rank);

  return (
    <div className="space-y-6" data-testid="pathology-queue">
      <PageHeader title="Pathology" description="Specimens sent to the lab, results to reconcile and follow-ups to close." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {STATUS_ORDER.map((status) => (
          <StatCard
            key={status}
            label={STATUS[status].label}
            value={queue.data ? queue.data.filter((row) => row.status === status).length : "–"}
            icon={STATUS[status].icon}
            isLoading={queue.isPending}
          />
        ))}
      </div>
      {queue.isError ? (
        <ErrorState message="Could not load the pathology queue." onRetry={() => void queue.refetch()} />
      ) : (
        <DataTable
          columns={COLUMNS}
          rows={rows}
          getRowId={(row) => row.caseId}
          isLoading={queue.isPending}
          onRowClick={(row) => router.push(`/cases/${row.caseId}?tab=pathology`)}
          empty={<EmptyState icon={Microscope} title="No specimens out" description="Jars logged in the procedure room appear here." className="border-0 py-8" />}
          data-testid="pathology-queue-table"
        />
      )}
    </div>
  );
}
