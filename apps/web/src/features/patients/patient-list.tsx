"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePatients } from "@asc/api-client/react";
import { formatDateTime } from "@asc/clinical-rules/time";
import type { PatientListItem } from "@asc/types";
import {
  Button,
  DataTable,
  EligibilityChip,
  EmptyState,
  ErrorState,
  Input,
  OfflineBanner,
  PageHeader,
  StaleBadge,
  type DataTableColumn,
} from "@asc/ui";
import { Search, UserPlus, UsersRound } from "@asc/ui/icons";

const COLUMNS: readonly DataTableColumn<PatientListItem>[] = [
  {
    id: "patient",
    header: "Patient",
    cell: (row) => (
      <span className="flex items-center gap-2.5">
        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
          {row.initials}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{row.displayName}</span>
          <span className="block text-xs text-muted-foreground tabular-nums">
            {row.age} y · {row.sex}
          </span>
        </span>
      </span>
    ),
  },
  { id: "mrn", header: "MRN", cell: (row) => <span className="font-mono text-xs">{row.mrn}</span> },
  { id: "dob", header: "DOB", cell: (row) => <span className="tabular-nums">{row.dateOfBirth}</span>, className: "hidden md:table-cell" },
  { id: "phone", header: "Phone", cell: (row) => <span className="tabular-nums">{row.phone}</span>, className: "hidden lg:table-cell" },
  {
    id: "coverage",
    header: "Coverage",
    cell: (row) => (
      <span className="flex flex-col gap-1">
        <span className="truncate text-xs">{row.payer ?? "Self-pay"}</span>
        <EligibilityChip status={row.eligibility} />
      </span>
    ),
  },
  {
    id: "allergies",
    header: "Allergies",
    align: "center",
    className: "hidden sm:table-cell",
    cell: (row) =>
      row.allergyCount === 0 ? (
        <span className="text-xs text-muted-foreground">NKDA</span>
      ) : (
        <span className="text-xs font-medium text-warning tabular-nums">{row.allergyCount}</span>
      ),
  },
  {
    id: "next",
    header: "Next case",
    cell: (row) =>
      row.nextCaseStart ? <span className="text-xs tabular-nums">{formatDateTime(row.nextCaseStart)}</span> : <span className="text-xs text-muted-foreground">—</span>,
  },
];

/** `/patients` — searchable patient index; row opens the chart (id-only URL). */
export function PatientList() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const query = usePatients({ q });
  const rows = query.data ?? [];
  const searching = q.trim() !== "";

  return (
    <div className="space-y-5" data-testid="patient-list">
      <PageHeader
        eyebrow="Front desk"
        title="Patients"
        description="Search by name, MRN, date of birth or phone."
        actions={
          <Button render={<Link href="/patients/new" />} nativeButton={false} data-testid="patients-register">
            <UserPlus aria-hidden /> Register patient
          </Button>
        }
      />
      <OfflineBanner />

      <div className="flex items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search aria-hidden className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
          <Input
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search patients"
            aria-label="Search patients"
            className="pl-8"
            data-testid="patients-search"
          />
        </div>
        <StaleBadge refreshing={query.isFetching && !query.isPending} stale={query.isRefetchError} />
        {query.data && (
          <span className="ml-auto text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {rows.length} {rows.length === 1 ? "patient" : "patients"}
          </span>
        )}
      </div>

      {query.isError && !query.data ? (
        <ErrorState title="Could not load patients" message="Check your connection and try again." onRetry={() => void query.refetch()} />
      ) : (
        <DataTable
          columns={COLUMNS}
          rows={rows}
          getRowId={(row) => row.id}
          onRowClick={(row) => router.push(`/patients/${row.id}`)}
          isLoading={query.isPending}
          data-testid="patients-table"
          empty={
            <EmptyState
              icon={UsersRound}
              title={searching ? "No patients match your search" : "No patients yet"}
              description={searching ? "Check the spelling or search by MRN / DOB — or register a new patient." : "Register the first patient or convert a referral."}
              action={
                <Button render={<Link href="/patients/new" />} nativeButton={false} variant="outline" size="sm">
                  <UserPlus aria-hidden /> Register patient
                </Button>
              }
              className="border-0"
            />
          }
        />
      )}
    </div>
  );
}
