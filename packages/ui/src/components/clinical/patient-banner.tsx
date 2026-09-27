import type { Allergy, CasePhase, Escort, PatientRef } from "@asc/types"
import { ShieldAlert, ShieldCheck, UserRound, UsersRound } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "../../lib/utils"
import { PhaseChip } from "./phase-chip"

export interface PatientBannerProps {
  readonly patient: PatientRef
  readonly allergies: readonly Allergy[]
  readonly phase?: CasePhase
  readonly escort?: Escort | null
  /** Extra identifiers shown after the MRN (case number, procedure, room). */
  readonly meta?: readonly ReactNode[]
  /** Right-aligned actions. */
  readonly actions?: ReactNode
  readonly className?: string
}

const SEX_LABEL = { F: "F", M: "M", X: "X" } as const

/** Patient identity strip shown on every patient/case screen (name, age/sex, MRN, allergies, phase, escort). */
export function PatientBanner({ patient, allergies, phase, escort, meta = [], actions, className }: PatientBannerProps) {
  const severe = allergies.some((allergy) => allergy.severity === "severe")
  return (
    <div
      data-testid="patient-banner"
      className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-xs lg:flex-row lg:items-center lg:justify-between", className)}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
          {patient.initials}
        </span>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="truncate text-base font-semibold tracking-tight">{patient.displayName}</h2>
            <span className="text-sm text-muted-foreground tabular-nums">
              {patient.age} y · {SEX_LABEL[patient.sex]}
            </span>
            {phase && <PhaseChip phase={phase} />}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">{patient.mrn}</span>
            <span className="tabular-nums">DOB {patient.dateOfBirth}</span>
            {meta.map((item, index) => (
              <span key={index}>{item}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          data-testid="patient-banner-allergies"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium",
            allergies.length === 0 && "border-border text-muted-foreground",
            allergies.length > 0 && !severe && "border-warning/30 bg-warning/10 text-warning",
            severe && "border-destructive/30 bg-destructive/8 text-destructive"
          )}
        >
          {allergies.length === 0 ? <ShieldCheck aria-hidden className="size-3.5" /> : <ShieldAlert aria-hidden className="size-3.5" />}
          {allergies.length === 0 ? "NKDA" : allergies.map((allergy) => allergy.substance).join(", ")}
        </span>
        {escort !== undefined && (
          <span
            data-testid="patient-banner-escort"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium",
              escort?.present ? "border-success/30 bg-success/8 text-success" : escort?.confirmed ? "border-border text-foreground" : "border-warning/30 bg-warning/10 text-warning"
            )}
          >
            {escort ? <UsersRound aria-hidden className="size-3.5" /> : <UserRound aria-hidden className="size-3.5" />}
            {escort ? `Escort ${escort.present ? "present" : escort.confirmed ? "confirmed" : "unconfirmed"} · ${escort.relationship}` : "No escort"}
          </span>
        )}
        {actions}
      </div>
    </div>
  )
}
