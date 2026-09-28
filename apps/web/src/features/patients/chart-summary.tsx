"use client";

import { ApiError } from "@asc/api-client";
import { useUpdateEscort } from "@asc/api-client/react";
import { formatDate } from "@asc/clinical-rules/time";
import type { Patient } from "@asc/types";
import { Button, SectionCard, toast } from "@asc/ui";
import { CircleCheck, CircleAlert, Loader2 } from "@asc/ui/icons";
import { CoverageCard } from "./coverage-card";

interface ChartSummaryProps {
  readonly patient: Patient;
}

/** Summary tab: demographics, coverage + eligibility, escort. */
export function ChartSummary({ patient }: ChartSummaryProps) {
  const updateEscort = useUpdateEscort(patient.id);
  const escort = patient.escort;

  const demographics = [
    { label: "Date of birth", value: formatDate(patient.dateOfBirth) },
    { label: "Sex", value: patient.sex },
    { label: "Phone", value: patient.phone },
    { label: "Email", value: patient.email ?? "—" },
    { label: "Language", value: patient.preferredLanguage },
    {
      label: "Address",
      value: patient.address ? `${patient.address.line}, ${patient.address.city}, ${patient.address.state} ${patient.address.postalCode}` : "—",
    },
    { label: "Referring provider", value: patient.referringProvider ?? "—" },
    { label: "Registered", value: formatDate(patient.createdAt) },
  ];

  const confirmEscort = async () => {
    if (!escort) return;
    try {
      await updateEscort.mutateAsync({ name: escort.name, relationship: escort.relationship, phone: escort.phone, confirmed: true });
      toast.success("Escort confirmed");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not update the escort.");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="chart-summary">
      <SectionCard title="Demographics" className="lg:row-span-2">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {demographics.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className="text-sm tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>
      <CoverageCard patient={patient} />
      <SectionCard
        title="Escort"
        description="Responsible adult for discharge after sedation."
        data-testid="chart-escort"
        actions={
          escort &&
          !escort.confirmed && (
            <Button size="sm" variant="outline" onClick={() => void confirmEscort()} disabled={updateEscort.isPending} data-testid="chart-escort-confirm">
              {updateEscort.isPending && <Loader2 aria-hidden className="animate-spin" />}
              Mark confirmed
            </Button>
          )
        }
      >
        {escort ? (
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{escort.name}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {escort.relationship} · {escort.phone}
              </p>
            </div>
            <span className={escort.confirmed ? "flex items-center gap-1 text-xs text-success" : "flex items-center gap-1 text-xs text-warning"}>
              {escort.confirmed ? <CircleCheck aria-hidden className="size-3.5" /> : <CircleAlert aria-hidden className="size-3.5" />}
              {escort.confirmed ? "Confirmed" : "Not confirmed"}
            </span>
          </div>
        ) : (
          <p className="text-sm text-warning">No escort on file — cases cannot be confirmed without one.</p>
        )}
      </SectionCard>
    </div>
  );
}
