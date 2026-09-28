import type { AllergySeverity, HoldStatus, Medication, Patient } from "@asc/types";
import { cn, DataTable, EmptyState, SectionCard, type DataTableColumn } from "@asc/ui";
import { Pill, ShieldCheck } from "@asc/ui/icons";

interface ChartMedsProps {
  readonly patient: Patient;
}

const SEVERITY_CLASS: Readonly<Record<AllergySeverity, string>> = {
  mild: "border-border text-muted-foreground",
  moderate: "border-warning/30 bg-warning/10 text-warning",
  severe: "border-destructive/30 bg-destructive/8 text-destructive",
};

const HOLD_LABEL: Readonly<Record<HoldStatus, { readonly label: string; readonly className: string }>> = {
  not_required: { label: "No hold", className: "text-muted-foreground" },
  pending: { label: "Hold pending", className: "text-warning font-medium" },
  confirmed: { label: "Hold confirmed", className: "text-success" },
  not_held: { label: "Not held", className: "text-destructive font-medium" },
};

const MED_COLUMNS: readonly DataTableColumn<Medication>[] = [
  {
    id: "name",
    header: "Medication",
    cell: (row) => (
      <span>
        <span className="font-medium">{row.name}</span> <span className="text-muted-foreground">{row.dose}</span>
      </span>
    ),
  },
  { id: "frequency", header: "Frequency", cell: (row) => row.frequency, className: "hidden sm:table-cell" },
  { id: "class", header: "Class", cell: (row) => <span className="text-xs">{row.medClass.replace("_", " ")}</span>, className: "hidden md:table-cell" },
  {
    id: "hold",
    header: "Pre-procedure hold",
    cell: (row) => (
      <span className="flex flex-col">
        <span className={cn("text-xs", HOLD_LABEL[row.holdStatus].className)}>{HOLD_LABEL[row.holdStatus].label}</span>
        {row.holdRule && <span className="text-[11px] text-muted-foreground">{row.holdRule.instruction}</span>}
      </span>
    ),
  },
];

/** Meds & allergies tab (reconciliation and hold decisions happen in the case pre-procedure tab). */
export function ChartMeds({ patient }: ChartMedsProps) {
  return (
    <div className="space-y-4" data-testid="chart-meds">
      <SectionCard title="Allergies">
        {patient.allergies.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck aria-hidden className="size-4" /> No known drug allergies
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {patient.allergies.map((allergy) => (
              <li key={allergy.id} className={cn("rounded-lg border px-2.5 py-1.5 text-sm", SEVERITY_CLASS[allergy.severity])}>
                <span className="font-medium">{allergy.substance}</span>
                <span className="text-xs"> · {allergy.reaction} · {allergy.severity}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <DataTable
        columns={MED_COLUMNS}
        rows={patient.medications}
        getRowId={(row) => row.id}
        empty={<EmptyState icon={Pill} title="No medications recorded" description="Nursing reconciles the list at pre-procedure." className="border-0" />}
      />
    </div>
  );
}
