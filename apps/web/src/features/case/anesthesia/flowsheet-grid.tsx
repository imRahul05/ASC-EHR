"use client";

import { AIRWAY_EVENT_LABEL, ANESTHESIA_DRUG_LABEL, formatTime24 } from "@asc/clinical-rules";
import type { AnesthesiaRecord } from "@asc/types";
import { cn, EmptyState, useNow } from "@asc/ui";
import { TableProperties } from "@asc/ui/icons";
import { columnOf, DRUG_PRESETS, DRUGS, FLOWSHEET_INTERVAL_MIN, flowsheetColumns, roundDose, VITAL_ROWS } from "./flowsheet-model";

interface FlowsheetGridProps {
  readonly record: AnesthesiaRecord;
  readonly live: boolean;
}

const HEAD_CELL = "sticky left-0 z-10 bg-card px-3 py-2 text-left text-sm font-medium whitespace-nowrap";
const CELL = "min-w-16 px-2 py-2 text-center text-sm tabular-nums";

/** AIMS flowsheet: 5-min time columns × vitals, drug and airway rows (latest value per column). */
export function FlowsheetGrid({ record, live }: FlowsheetGridProps) {
  const now = useNow();
  const columns = flowsheetColumns(record, now, live);
  if (columns.length === 0) {
    return <EmptyState icon={TableProperties} title="Flowsheet is empty" description="Start sedation or add a vitals row to begin the record." />;
  }

  const byColumn = <T,>(items: readonly T[], at: (item: T) => string) => {
    const cells = new Map<number, T[]>();
    for (const item of items) {
      const index = columnOf(columns, at(item));
      cells.set(index, [...(cells.get(index) ?? []), item]);
    }
    return cells;
  };
  const vitals = byColumn(record.vitals, (entry) => entry.recordedAt);
  const usedDrugs = DRUGS.filter((drug) => record.doses.some((dose) => dose.drug === drug));
  const airway = byColumn(record.airwayEvents, (event) => event.at);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card" data-testid="anesthesia-flowsheet">
      <table className="w-full border-collapse">
        <caption className="sr-only">Anesthesia flowsheet in {FLOWSHEET_INTERVAL_MIN}-minute columns</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={cn(HEAD_CELL, "text-xs text-muted-foreground")}>
              Time
            </th>
            {columns.map((start) => (
              <th key={start} scope="col" className={cn(CELL, "font-mono text-xs font-medium text-muted-foreground")}>
                {formatTime24(new Date(start).toISOString())}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {VITAL_ROWS.map((row) => (
            <tr key={row.id} data-testid={`anesthesia-row-${row.id}`}>
              <th scope="row" className={HEAD_CELL}>
                {row.label} <span className="text-xs font-normal text-muted-foreground">{row.unit}</span>
              </th>
              {columns.map((start, index) => {
                const entry = vitals.get(index)?.at(-1);
                const value = entry ? row.value(entry) : null;
                const low = row.id === "spo2" && entry && entry.spo2 < 92;
                return (
                  <td key={start} className={cn(CELL, low && "font-semibold text-destructive")}>
                    {value ?? <span className="text-muted-foreground/50">·</span>}
                  </td>
                );
              })}
            </tr>
          ))}
          {usedDrugs.map((drug) => {
            const doses = byColumn(
              record.doses.filter((dose) => dose.drug === drug),
              (dose) => dose.at,
            );
            return (
              <tr key={drug} className="bg-ai/40" data-testid={`anesthesia-row-${drug}`}>
                <th scope="row" className={cn(HEAD_CELL, "bg-card")}>
                  {ANESTHESIA_DRUG_LABEL[drug]} <span className="text-xs font-normal text-muted-foreground">{DRUG_PRESETS[drug].unit}</span>
                </th>
                {columns.map((start, index) => {
                  const total = roundDose((doses.get(index) ?? []).reduce((sum, dose) => sum + dose.amount, 0));
                  return (
                    <td key={start} className={cn(CELL, total > 0 && "font-semibold")}>
                      {total > 0 ? total : ""}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          <tr data-testid="anesthesia-row-airway">
            <th scope="row" className={HEAD_CELL}>
              Airway
            </th>
            {columns.map((start, index) => (
              <td key={start} className={cn(CELL, "text-xs")}>
                {(airway.get(index) ?? []).map((event) => AIRWAY_EVENT_LABEL[event.type]).join(", ")}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
