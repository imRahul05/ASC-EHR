"use client";

import { useState } from "react";
import { useAuditLog } from "@asc/api-client/react";
import { formatDateTime } from "@asc/clinical-rules/time";
import type { AuditEvent, AuditQuery } from "@asc/types";
import { Badge, Button, DataTable, EmptyState, ErrorState, FormField, OptionSelect, PageHeader, type DataTableColumn } from "@asc/ui";
import { CircleCheck, CircleX, FilterX, ScrollText, ShieldX, type LucideIcon } from "@asc/ui/icons";
import { AuditDetailSheet } from "./audit-detail-sheet";

type FilterKey = "action" | "role" | "outcome" | "entityType";
type Filters = Partial<Record<FilterKey, string>>;

const ALL = "all";

/** Filter controls as data: each maps to one `AuditQuery` field. `action` is a prefix (`note.` → note.sign, …). */
const FILTERS: readonly { readonly key: FilterKey; readonly label: string; readonly options: readonly { readonly value: string; readonly label: string }[] }[] = [
  {
    key: "action",
    label: "Action",
    options: [
      { value: "case.", label: "Case (book, transition)" },
      { value: "note.", label: "Procedure note" },
      { value: "coding.", label: "Coding" },
      { value: "charges.", label: "Charge export" },
      { value: "pathology.", label: "Pathology" },
      { value: "surveillance.", label: "Surveillance" },
      { value: "letter.", label: "Result letters" },
      { value: "discharge.", label: "Discharge" },
      { value: "aldrete.", label: "Aldrete" },
      { value: "preop.", label: "Pre-op" },
      { value: "portal.", label: "Patient portal" },
      { value: "demo.", label: "Demo" },
    ],
  },
  {
    key: "role",
    label: "Actor role",
    options: [
      { value: "ADMIN", label: "Admin / front desk" },
      { value: "SURGEON", label: "Surgeon" },
      { value: "NURSE", label: "Nurse" },
      { value: "ANESTHESIOLOGIST", label: "Anesthesia" },
      { value: "PATIENT", label: "Patient" },
      { value: "SYSTEM", label: "System" },
    ],
  },
  {
    key: "entityType",
    label: "Resource",
    options: ["ProcedureCase", "NoteDraft", "CodingSuggestion", "ChargeExport", "PathologyResult", "ResultLetter", "Patient", "WorkItem", "Referral"].map((value) => ({ value, label: value })),
  },
  {
    key: "outcome",
    label: "Outcome",
    options: [
      { value: "success", label: "Success" },
      { value: "denied", label: "Denied" },
      { value: "failure", label: "Failure" },
    ],
  },
];

const OUTCOME: Readonly<Record<AuditEvent["outcome"], { readonly icon: LucideIcon; readonly className: string }>> = {
  success: { icon: CircleCheck, className: "text-success" },
  denied: { icon: ShieldX, className: "text-warning" },
  failure: { icon: CircleX, className: "text-destructive" },
};

const COLUMNS: readonly DataTableColumn<AuditEvent>[] = [
  { id: "at", header: "Time", cell: (row) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(row.at)}</span> },
  {
    id: "actor",
    header: "Actor",
    cell: (row) => (
      <div>
        <p className="text-sm">{row.actor.name}</p>
        <p className="text-[11px] text-muted-foreground">{row.actor.role}</p>
      </div>
    ),
  },
  { id: "action", header: "Action", cell: (row) => <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.action}</code> },
  {
    id: "resource",
    header: "Resource",
    cell: (row) => (
      <span className="text-xs">
        {row.entity.type} <span className="font-mono text-muted-foreground">{row.entity.id}</span>
      </span>
    ),
  },
  { id: "summary", header: "Summary", className: "max-w-80 truncate", cell: (row) => <span className="text-sm text-muted-foreground">{row.summary}</span> },
  {
    id: "outcome",
    header: "Outcome",
    cell: (row) => {
      const { icon: Icon, className } = OUTCOME[row.outcome];
      return (
        <Badge variant="outline" className={className}>
          <Icon /> {row.outcome}
        </Badge>
      );
    },
  },
];

/** `/audit` — filterable audit trail (who did what to which resource, when). Details carry ids/codes only — no PHI. */
export function AuditLog() {
  const [filters, setFilters] = useState<Filters>({});
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const query: AuditQuery = filters as AuditQuery;
  const log = useAuditLog(query);
  const active = Object.values(filters).some(Boolean);

  const setFilter = (key: FilterKey, value: string) =>
    setFilters((prev) => {
      const next = { ...prev };
      if (value === ALL) delete next[key];
      else next[key] = value;
      return next;
    });

  return (
    <div className="space-y-6" data-testid="audit-log">
      <PageHeader title="Audit log" description="Every command and sign-off, newest first. Summaries contain identifiers and codes only." />
      <div className="flex flex-wrap items-end gap-3" role="search" aria-label="Filter audit events">
        {FILTERS.map((filter) => (
          <FormField key={filter.key} id={`audit-filter-${filter.key}`} label={filter.label} className="w-full sm:w-48">
            <OptionSelect
              id={`audit-filter-${filter.key}`}
              options={[{ value: ALL, label: "All" }, ...filter.options]}
              value={filters[filter.key] ?? ALL}
              onValueChange={(value) => setFilter(filter.key, value)}
              data-testid={`audit-filter-${filter.key}`}
            />
          </FormField>
        ))}
        {active && (
          <Button variant="ghost" onClick={() => setFilters({})} data-testid="audit-filter-clear">
            <FilterX /> Clear
          </Button>
        )}
      </div>
      {log.isError ? (
        <ErrorState message="Could not load the audit log." onRetry={() => void log.refetch()} />
      ) : (
        <DataTable
          columns={COLUMNS}
          rows={log.data ?? []}
          getRowId={(row) => row.id}
          isLoading={log.isPending}
          onRowClick={setSelected}
          empty={<EmptyState icon={ScrollText} title="No matching events" description="Clear a filter to widen the search." className="border-0 py-8" />}
          data-testid="audit-table"
        />
      )}
      <AuditDetailSheet event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
