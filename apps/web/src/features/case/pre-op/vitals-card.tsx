"use client";

import { useForm } from "react-hook-form";
import { ApiError } from "@asc/api-client";
import { useSaveVitals } from "@asc/api-client/react";
import { formatTime24 } from "@asc/clinical-rules/time";
import type { VitalsEntry } from "@asc/types";
import { Button, FormField, Input, SectionCard, Sparkline, toast } from "@asc/ui";
import { LoaderCircle, Plus } from "@asc/ui/icons";

interface VitalsCardProps {
  readonly caseId: string;
  readonly vitals: readonly VitalsEntry[];
}

type VitalKey = "hr" | "sbp" | "dbp" | "spo2" | "rr" | "tempC" | "pain";
type VitalsForm = Record<VitalKey, number>;

/** Plausibility ranges (entry guard, not clinical thresholds). Optional fields may stay blank. */
const VITAL_FIELDS: readonly {
  readonly name: VitalKey;
  readonly label: string;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly optional?: boolean;
}[] = [
  { name: "hr", label: "HR", unit: "bpm", min: 30, max: 220 },
  { name: "sbp", label: "SBP", unit: "mmHg", min: 60, max: 260 },
  { name: "dbp", label: "DBP", unit: "mmHg", min: 30, max: 160 },
  { name: "spo2", label: "SpO₂", unit: "%", min: 70, max: 100 },
  { name: "rr", label: "RR", unit: "/min", min: 6, max: 40 },
  { name: "tempC", label: "Temp", unit: "°C", min: 34, max: 42, step: 0.1, optional: true },
  { name: "pain", label: "Pain", unit: "0–10", min: 0, max: 10, optional: true },
];

const TRENDS: readonly { readonly key: "hr" | "sbp" | "spo2"; readonly label: string; readonly unit: string }[] = [
  { key: "hr", label: "HR", unit: "bpm" },
  { key: "sbp", label: "SBP", unit: "mmHg" },
  { key: "spo2", label: "SpO₂", unit: "%" },
];

const bp = (entry: VitalsEntry) => `${entry.sbp}/${entry.dbp}`;

/** Pre-op vitals entry (units on every field) with a mini trend and the latest readings. */
export function VitalsCard({ caseId, vitals }: VitalsCardProps) {
  const save = useSaveVitals(caseId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<VitalsForm>({ mode: "onBlur" });
  const rows = vitals.filter((entry) => entry.context === "pre_op").sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  const latest = rows.at(-1);

  const onSubmit = handleSubmit((values) => {
    const { tempC, pain, ...required } = values;
    save.mutate(
      { context: "pre_op", ...required, ...(Number.isNaN(tempC) ? {} : { tempC }), ...(Number.isNaN(pain) ? {} : { pain }) },
      {
        onSuccess: () => {
          toast.success("Vitals recorded");
          reset();
        },
        onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not save vitals"),
      },
    );
  });

  return (
    <SectionCard
      title="Vitals"
      description={latest ? `Last at ${formatTime24(latest.recordedAt)} by ${latest.recordedBy.name}` : "No pre-op vitals yet."}
      data-testid="preop-vitals"
    >
      <div className="space-y-4">
        {rows.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-3" data-testid="preop-vitals-trend">
            {TRENDS.map((trend) => {
              const values = rows.map((entry) => entry[trend.key]);
              const last = values.at(-1);
              return (
                <div key={trend.key} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                  <div>
                    <p className="text-xs text-muted-foreground">{trend.label}</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {trend.key === "sbp" && latest ? bp(latest) : last}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">{trend.unit}</span>
                    </p>
                  </div>
                  <Sparkline values={values} label={`${trend.label} trend, latest ${last ?? "none"} ${trend.unit}`} />
                </div>
              );
            })}
          </div>
        )}

        <form onSubmit={(event) => void onSubmit(event)} noValidate className="space-y-3" aria-label="Record vitals">
          <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {VITAL_FIELDS.map((field) => (
              <FormField key={field.name} id={`vitals-${field.name}`} label={`${field.label} (${field.unit})`} error={errors[field.name]?.message}>
                <Input
                  id={`vitals-${field.name}`}
                  type="number"
                  inputMode="decimal"
                  step={field.step ?? 1}
                  className="h-11 tabular-nums"
                  aria-invalid={errors[field.name] ? true : undefined}
                  data-testid={`preop-vitals-${field.name}`}
                  {...register(field.name, {
                    valueAsNumber: true,
                    validate: (value) => {
                      if (Number.isNaN(value)) return field.optional ? true : "Required";
                      return (value >= field.min && value <= field.max) || `${field.min}–${field.max}`;
                    },
                  })}
                />
              </FormField>
            ))}
          </div>
          <div className="flex justify-end">
            <Button type="submit" className="min-h-11" disabled={save.isPending} data-testid="preop-vitals-submit">
              {save.isPending ? <LoaderCircle className="animate-spin" /> : <Plus aria-hidden />}
              Record vitals
            </Button>
          </div>
        </form>

        {rows.length > 0 && (
          <table className="w-full text-sm tabular-nums" data-testid="preop-vitals-table">
            <caption className="sr-only">Pre-op vitals, newest first</caption>
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border text-left">
                <th className="py-1.5 font-medium">Time</th>
                <th className="py-1.5 font-medium">HR bpm</th>
                <th className="py-1.5 font-medium">BP mmHg</th>
                <th className="py-1.5 font-medium">SpO₂ %</th>
                <th className="py-1.5 font-medium">RR /min</th>
                <th className="py-1.5 font-medium">Temp °C</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((entry) => (
                <tr key={entry.id} className="border-b border-border/60 last:border-0">
                  <td className="py-1.5">{formatTime24(entry.recordedAt)}</td>
                  <td>{entry.hr}</td>
                  <td>{bp(entry)}</td>
                  <td>{entry.spo2}</td>
                  <td>{entry.rr}</td>
                  <td>{entry.tempC?.toFixed(1) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </SectionCard>
  );
}
