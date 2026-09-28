"use client";

import { useRouter } from "next/navigation";
import { useCodingQueue } from "@asc/api-client/react";
import { formatDate } from "@asc/clinical-rules/time";
import type { CodingQueueItem } from "@asc/types";
import { Badge, DataTable, EmptyState, ErrorState, PageHeader, PhaseChip, StatCard, type DataTableColumn } from "@asc/ui";
import { FileOutput, Hourglass, Receipt, ShieldCheck, TriangleAlert, type LucideIcon } from "@asc/ui/icons";

type QueueStatus = CodingQueueItem["status"];

const STATUS: Readonly<Record<QueueStatus, { readonly label: string; readonly icon: LucideIcon; readonly className: string; readonly rank: number }>> = {
  in_review: { label: "In review", icon: Receipt, className: "border-ai-border bg-ai text-ai-foreground", rank: 0 },
  not_ready: { label: "Waiting on note", icon: Hourglass, className: "text-muted-foreground", rank: 1 },
  attested: { label: "Attested", icon: ShieldCheck, className: "border-info/30 bg-info/10 text-info", rank: 2 },
  exported: { label: "Exported", icon: FileOutput, className: "border-success/30 bg-success/10 text-success", rank: 3 },
};
const STATUS_ORDER: readonly QueueStatus[] = ["in_review", "attested", "exported", "not_ready"];

const COLUMNS: readonly DataTableColumn<CodingQueueItem>[] = [
  { id: "case", header: "Case", cell: (row) => <span className="font-mono text-sm">{row.caseNumber}</span> },
  { id: "patient", header: "Patient", cell: (row) => <span className="text-sm font-medium">{row.patient.displayName}</span> },
  { id: "procedure", header: "Procedure", cell: (row) => row.procedureLabel },
  { id: "date", header: "Date", cell: (row) => <span className="tabular-nums">{formatDate(row.procedureDate)}</span> },
  { id: "phase", header: "Phase", cell: (row) => <PhaseChip phase={row.phase} /> },
  {
    id: "codes",
    header: "Codes",
    align: "right",
    cell: (row) => (
      <span className="inline-flex items-center gap-2 tabular-nums">
        {row.lowConfidenceCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-xs text-warning" title="Low-confidence suggestions">
            <TriangleAlert className="size-3.5" aria-hidden /> {row.lowConfidenceCount} low
          </span>
        )}
        {row.suggestionCount}
      </span>
    ),
  },
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

/** `/coding` — coding queue (in review first); each row opens the case coding tab. */
export function CodingQueue() {
  const router = useRouter();
  const queue = useCodingQueue();
  const rows = [...(queue.data ?? [])].sort((a, b) => STATUS[a.status].rank - STATUS[b.status].rank);

  return (
    <div className="space-y-6" data-testid="coding-queue">
      <PageHeader title="Coding" description="AI-suggested codes waiting for a coder, attested cases and charge exports." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
        <ErrorState message="Could not load the coding queue." onRetry={() => void queue.refetch()} />
      ) : (
        <DataTable
          columns={COLUMNS}
          rows={rows}
          getRowId={(row) => row.caseId}
          isLoading={queue.isPending}
          onRowClick={(row) => router.push(`/cases/${row.caseId}?tab=coding`)}
          empty={<EmptyState icon={Receipt} title="Queue is empty" description="Cases appear here once the procedure note is generated." className="border-0 py-8" />}
          data-testid="coding-queue-table"
        />
      )}
    </div>
  );
}
