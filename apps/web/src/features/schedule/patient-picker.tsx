"use client";

import { useState } from "react";
import { usePatient, usePatients } from "@asc/api-client/react";
import { Button, cn, Input, Skeleton } from "@asc/ui";
import { BadgeCheck, CircleAlert, Search, X } from "@asc/ui/icons";

interface PatientPickerProps {
  readonly id: string;
  readonly value: string;
  readonly onChange: (patientId: string) => void;
  readonly invalid?: boolean;
}

const RESULT_LIMIT = 6;

/** Search-and-pick a patient for booking; shows the chosen patient's identity + eligibility. */
export function PatientPicker({ id, value, onChange, invalid }: PatientPickerProps) {
  const [q, setQ] = useState("");
  const results = usePatients({ q });

  if (value) return <SelectedPatient patientId={value} onClear={() => onChange("")} />;

  const rows = (results.data ?? []).slice(0, RESULT_LIMIT);
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
        <Input
          id={id}
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search name, MRN or DOB"
          aria-invalid={invalid || undefined}
          autoComplete="off"
          className="pl-8"
          data-testid="book-case-patient-search"
        />
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border" aria-label="Matching patients">
        {results.isPending &&
          Array.from({ length: 3 }, (_, index) => (
            <li key={index} className="px-3 py-2">
              <Skeleton className="h-4 w-40" />
            </li>
          ))}
        {results.isError && <li className="px-3 py-2 text-sm text-destructive">Search failed — try again.</li>}
        {!results.isPending && rows.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No patients match “{q}”.</li>}
        {rows.map((patient) => (
          <li key={patient.id}>
            <button
              type="button"
              onClick={() => onChange(patient.id)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent"
              data-testid="book-case-patient-option"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{patient.displayName}</span>
                <span className="block text-xs text-muted-foreground tabular-nums">
                  <span className="font-mono">{patient.mrn}</span> · DOB {patient.dateOfBirth}
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{patient.payer ?? "Self-pay"}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface SelectedPatientProps {
  readonly patientId: string;
  readonly onClear: () => void;
}

function SelectedPatient({ patientId, onClear }: SelectedPatientProps) {
  const query = usePatient(patientId);
  const patient = query.data;
  const eligibility = patient?.coverage?.eligibility?.status;
  const eligible = eligibility === "active";
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5" data-testid="book-case-patient-selected">
      {query.isPending && <Skeleton className="h-9 w-48" />}
      {query.isError && <span className="text-sm text-destructive">Could not load the patient.</span>}
      {patient && (
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-sm font-semibold">
            {patient.firstName} {patient.lastName}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            <span className="font-mono">{patient.mrn}</span> · DOB {patient.dateOfBirth} · {patient.coverage?.payer ?? "No coverage"}
          </p>
          <p className={cn("flex items-center gap-1 text-xs", eligible ? "text-success" : "text-warning")}>
            {eligible ? <BadgeCheck aria-hidden className="size-3.5" /> : <CircleAlert aria-hidden className="size-3.5" />}
            {eligible ? "Eligibility active" : "Eligibility not verified — confirm is blocked until 270/271 runs"}
          </p>
        </div>
      )}
      <Button type="button" variant="ghost" size="icon-sm" onClick={onClear} aria-label="Change patient" data-testid="book-case-patient-clear">
        <X aria-hidden />
      </Button>
    </div>
  );
}
