"use client";

import { useState, type FormEvent } from "react";
import { useAddAnesthesiaEntry } from "@asc/api-client/react";
import type { SaveVitalsPayload } from "@asc/types";
import { Button, FormField, Input, toast } from "@asc/ui";
import { LoaderCircle, Plus } from "@asc/ui/icons";
import { notifyError } from "../notify-error";

interface VitalsEntryFormProps {
  readonly caseId: string;
}

type FieldName = "hr" | "sbp" | "dbp" | "spo2" | "etco2" | "rr";

/** One config entry per input (label with unit, plausible range, required). */
const FIELDS: readonly { readonly name: FieldName; readonly label: string; readonly min: number; readonly max: number; readonly required: boolean }[] = [
  { name: "hr", label: "HR (bpm)", min: 20, max: 250, required: true },
  { name: "sbp", label: "SBP (mmHg)", min: 40, max: 260, required: true },
  { name: "dbp", label: "DBP (mmHg)", min: 20, max: 160, required: true },
  { name: "spo2", label: "SpO₂ (%)", min: 50, max: 100, required: true },
  { name: "etco2", label: "EtCO₂ (mmHg)", min: 5, max: 90, required: false },
  { name: "rr", label: "RR (/min)", min: 2, max: 60, required: true },
];

type Values = Readonly<Record<FieldName, string>>;
const EMPTY: Values = { hr: "", sbp: "", dbp: "", spo2: "", etco2: "", rr: "" };

function fieldError(field: (typeof FIELDS)[number], raw: string): string | undefined {
  if (raw === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= field.min && value <= field.max ? undefined : `${field.min}–${field.max}`;
}

/** Add a flowsheet row (time = now, lands in the current 5-min column). */
export function VitalsEntryForm({ caseId }: VitalsEntryFormProps) {
  const [values, setValues] = useState<Values>(EMPTY);
  const add = useAddAnesthesiaEntry(caseId);
  const errors = Object.fromEntries(FIELDS.map((field) => [field.name, fieldError(field, values[field.name])])) as Record<FieldName, string | undefined>;
  const complete = FIELDS.every((field) => !field.required || values[field.name] !== "");
  const valid = complete && Object.values(errors).every((error) => error === undefined);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid) return;
    const vitals: SaveVitalsPayload = {
      hr: Number(values.hr),
      sbp: Number(values.sbp),
      dbp: Number(values.dbp),
      spo2: Number(values.spo2),
      rr: Number(values.rr),
      ...(values.etco2 ? { etco2: Number(values.etco2) } : {}),
      context: "intra",
    };
    add.mutate(
      { kind: "vitals", vitals },
      {
        onSuccess: () => {
          toast.success("Vitals row added");
          setValues(EMPTY);
        },
        onError: notifyError("Could not add vitals"),
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-3" data-testid="anesthesia-vitals-form" aria-label="Add vitals row">
      <div className="grid grid-cols-3 gap-3 @xl:grid-cols-6">
        {FIELDS.map((field) => (
          <FormField key={field.name} id={`vitals-${field.name}`} label={field.label} error={errors[field.name]}>
            <Input
              id={`vitals-${field.name}`}
              inputMode="numeric"
              value={values[field.name]}
              onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
              aria-invalid={errors[field.name] ? true : undefined}
              className="h-11 text-base tabular-nums"
              data-testid={`anesthesia-vitals-${field.name}`}
            />
          </FormField>
        ))}
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="lg" className="h-11" disabled={!valid || add.isPending} data-testid="anesthesia-vitals-add">
          {add.isPending ? <LoaderCircle className="animate-spin" /> : <Plus />}
          Add row
        </Button>
      </div>
    </form>
  );
}
