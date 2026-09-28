"use client";

import { useRouter } from "next/navigation";
import { useSearch } from "@asc/api-client/react";
import { formatDateTime } from "@asc/clinical-rules/time";
import type { Patient, ProcedureCase } from "@asc/types";
import { DataTable, EmptyState, ErrorState, PhaseChip, StaleBadge, type DataTableColumn } from "@asc/ui";
import { CalendarX2 } from "@asc/ui/icons";

interface ChartCasesProps {
  readonly patient: Patient;
}

const COLUMNS: readonly DataTableColumn<ProcedureCase>[] = [
  { id: "case", header: "Case", cell: (row) => <span className="font-mono text-xs">{row.caseNumber}</span> },
  { id: "when", header: "Scheduled", cell: (row) => <span className="tabular-nums">{formatDateTime(row.scheduledStart)}</span> },
  { id: "procedure", header: "Procedure", cell: (row) => `${row.procedureLabel} · ${row.intent}` },
  { id: "room", header: "Room", cell: (row) => row.roomId.replace("room-", "Room "), className: "hidden sm:table-cell" },
  { id: "surgeon", header: "Gastroenterologist", cell: (row) => row.team.surgeon.name, className: "hidden md:table-cell" },
  { id: "phase", header: "Phase", cell: (row) => <PhaseChip phase={row.phase} /> },
];

/** Cases tab: every case for this patient (search is by name, filtered to the id). */
export function ChartCases({ patient }: ChartCasesProps) {
  const router = useRouter();
  const query = useSearch(`${patient.firstName} ${patient.lastName}`);
  const rows = (query.data?.cases ?? []).filter((item) => item.patientId === patient.id);

  if (query.isError && !query.data) {
    return <ErrorState title="Could not load cases" onRetry={() => void query.refetch()} />;
  }
  return (
    <div className="space-y-2" data-testid="chart-cases">
      <StaleBadge refreshing={query.isFetching && !query.isPending} />
      <DataTable
        columns={COLUMNS}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={query.isPending}
        onRowClick={(row) => router.push(`/cases/${row.id}`)}
        empty={<EmptyState icon={CalendarX2} title="No cases yet" description="Book the first procedure from the button above." className="border-0" />}
      />
    </div>
  );
}
