"use client";

import { useForm } from "react-hook-form";
import { ApiError } from "@asc/api-client";
import { useSaveVitals } from "@asc/api-client/react";
import { formatTime24 } from "@asc/clinical-rules/time";
import type { SaveVitalsPayload, VitalsEntry } from "@asc/types";
import { Button, DataTable, EmptyState, FormField, Input, SectionCard, Sparkline, toast, type DataTableColumn } from "@asc/ui";
import { HeartPulse, LoaderCircle, Plus } from "@asc/ui/icons";

type VitalsField = "hr" | "sbp" | "dbp" | "spo2" | "rr" | "pain";
type VitalsForm = Record<VitalsField, number>;

/** One config per vital: label with unit, plausible range (validation), and table formatting. */
const FIELDS: readonly { readonly name: VitalsField; readonly label: string; readonly min: number; readonly max: number }[] = [
  { name: "hr", label: "HR (bpm)", min: 20, max: 250 },
  { name: "sbp", label: "SBP (mmHg)", min: 50, max: 260 },
  { name: "dbp", label: "DBP (mmHg)", min: 20, max: 160 },
  { name: "spo2", label: "SpO₂ (%)", min: 50, max: 100 },
  { name: "rr", label: "RR (/min)", min: 4, max: 60 },
  { name: "pain", label: "Pain (0–10)", min: 0, max: 10 },
];

const COLUMNS: readonly DataTableColumn<VitalsEntry>[] = [
  { id: "at", header: "Time", cell: (row) => <span className="tabular-nums">{formatTime24(row.recordedAt)}</span> },
  { id: "hr", header: "HR", align: "right", cell: (row) => <span className="tabular-nums">{row.hr} bpm</span> },
  { id: "bp", header: "BP", align: "right", cell: (row) => <span className="tabular-nums">{row.sbp}/{row.dbp} mmHg</span> },
  { id: "spo2", header: "SpO₂", align: "right", cell: (row) => <span className="tabular-nums">{row.spo2} %</span> },
  { id: "rr", header: "RR", align: "right", cell: (row) => <span className="tabular-nums">{row.rr} /min</span> },
  { id: "pain", header: "Pain", align: "right", cell: (row) => <span className="tabular-nums">{row.pain ?? "–"}/10</span> },
  { id: "by", header: "By", cell: (row) => <span className="text-muted-foreground">{row.recordedBy.initials}</span> },
];

interface PacuVitalsCardProps {
  readonly caseId: string;
  readonly vitals: readonly VitalsEntry[];
  readonly editable: boolean;
}

/** PACU vitals: trend sparklines, table (newest first) and a quick-entry row. */
export function PacuVitalsCard({ caseId, vitals, editable }: PacuVitalsCardProps) {
  const save = useSaveVitals(caseId);
  const { register, handleSubmit, reset, formState } = useForm<VitalsForm>();
  const pacu = vitals.filter((entry) => entry.context === "pacu").sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  const latest = pacu.at(-1);

  const onSubmit = (values: VitalsForm) => {
    const payload: SaveVitalsPayload = { context: "pacu", ...values };
    save.mutate(payload, {
      onSuccess: () => {
        toast.success("PACU vitals recorded");
        reset();
      },
      onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not save vitals"),
    });
  };

  return (
    <SectionCard
      title="PACU vitals"
      description={latest ? `Last set ${formatTime24(latest.recordedAt)}` : "Record a set on arrival and every 15 min."}
      actions={
        pacu.length > 1 ? (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              HR <Sparkline values={pacu.map((entry) => entry.hr)} label={`Heart rate trend, latest ${latest?.hr ?? ""} bpm`} className="h-5 w-16 text-chart-1" />
            </span>
            <span className="flex items-center gap-1">
              SpO₂ <Sparkline values={pacu.map((entry) => entry.spo2)} label={`SpO2 trend, latest ${latest?.spo2 ?? ""} %`} className="h-5 w-16 text-chart-2" />
            </span>
          </div>
        ) : undefined
      }
      data-testid="recovery-vitals"
    >
      <div className="space-y-4">
        {pacu.length === 0 ? (
          <EmptyState icon={HeartPulse} title="No PACU vitals yet" description="Enter the arrival set below." className="py-6" />
        ) : (
          <DataTable columns={COLUMNS} rows={pacu.toReversed()} getRowId={(row) => row.id} data-testid="recovery-vitals-table" />
        )}
        {editable && (
          <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} className="space-y-3" aria-label="Add PACU vitals">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {FIELDS.map((field) => (
                <FormField key={field.name} id={`pacu-${field.name}`} label={field.label} error={formState.errors[field.name] ? `${field.min}–${field.max}` : undefined}>
                  <Input
                    id={`pacu-${field.name}`}
                    type="number"
                    inputMode="numeric"
                    className="tabular-nums"
                    data-testid={`recovery-vitals-${field.name}`}
                    {...register(field.name, { valueAsNumber: true, required: true, min: field.min, max: field.max })}
                  />
                </FormField>
              ))}
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="outline" disabled={save.isPending} data-testid="recovery-vitals-save">
                {save.isPending ? <LoaderCircle className="animate-spin" /> : <Plus />}
                Add vitals
              </Button>
            </div>
          </form>
        )}
      </div>
    </SectionCard>
  );
}
