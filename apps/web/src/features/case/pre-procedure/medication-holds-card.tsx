"use client";

import { ApiError } from "@asc/api-client";
import { useSaveHp } from "@asc/api-client/react";
import { medHoldCheck } from "@asc/clinical-rules";
import { formatDate } from "@asc/clinical-rules/time";
import type { HoldStatus, Medication } from "@asc/types";
import { Button, cn, GateChecklist, SectionCard, toast } from "@asc/ui";
import { ClipboardCheck, Pill } from "@asc/ui/icons";
import { HOLD_STATUS_META, MED_CLASS_LABEL, holdWindowLabel } from "./hp-config";

interface MedicationHoldsCardProps {
  readonly caseId: string;
  readonly medications: readonly Medication[];
  readonly scheduledStart: string;
  readonly holdsReviewed: boolean;
  /** H&P already signed — hold decisions are locked (no addenda in the demo). */
  readonly locked: boolean;
}

const DAY_MS = 86_400_000;

const DECISIONS: readonly { readonly status: HoldStatus; readonly label: string; readonly variant: "default" | "outline" }[] = [
  { status: "confirmed", label: "Confirm held", variant: "default" },
  { status: "not_required", label: "Not required", variant: "outline" },
  { status: "not_held", label: "Not held", variant: "outline" },
];

function lastDoseText(med: Medication, scheduledStart: string): string {
  if (!med.lastTakenAt) return "Last dose not documented";
  const days = Math.floor((Date.parse(scheduledStart) - Date.parse(`${med.lastTakenAt}T00:00:00`)) / DAY_MS);
  return `Last dose ${formatDate(med.lastTakenAt)} (${days} day${days === 1 ? "" : "s"} before)`;
}

/** Medication list with hold rules from @asc/clinical-rules (medHoldCheck) and per-med hold decisions. */
export function MedicationHoldsCard({ caseId, medications, scheduledStart, holdsReviewed, locked }: MedicationHoldsCardProps) {
  const save = useSaveHp(caseId);
  const holds = medHoldCheck(medications);
  const notHeld = medications.some((med) => med.holdRule && med.holdStatus === "not_held");
  const pending = medications.some((med) => med.holdRule && med.holdStatus === "pending");

  const decide = (med: Medication, holdStatus: HoldStatus) =>
    save.mutate(
      { holdDecisions: [{ medicationId: med.id, holdStatus }] },
      {
        onSuccess: () => toast.success(`${med.name}: ${HOLD_STATUS_META[holdStatus].label.toLowerCase()}`),
        onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not save the hold decision"),
      },
    );

  const completeReview = () =>
    save.mutate(
      { holdsReviewed: true },
      {
        onSuccess: () => toast.success("Medication review complete"),
        onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not save the review"),
      },
    );

  return (
    <SectionCard
      title="Medications & holds"
      description="Center GI peri-procedural protocol. Every hold must be confirmed before the case is ready."
      data-testid="hp-medications"
      footer={
        holdsReviewed ? (
          <p className="mr-auto flex items-center gap-1.5 text-sm text-success" data-testid="hp-holds-reviewed">
            <ClipboardCheck aria-hidden className="size-4" /> Medication review complete
          </p>
        ) : (
          <Button
            className="min-h-11"
            onClick={completeReview}
            disabled={locked || pending || save.isPending}
            data-testid="hp-holds-review-complete"
          >
            <ClipboardCheck aria-hidden /> Mark medication review complete
          </Button>
        )
      }
    >
      {medications.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active medications on file.</p>
      ) : (
        <div className="space-y-4">
          <ul className="divide-y divide-border">
            {medications.map((med) => {
              const status = HOLD_STATUS_META[med.holdStatus];
              const StatusIcon = status.icon;
              return (
                <li key={med.id} className="space-y-2 py-3 first:pt-0 last:pb-0" data-testid={`hp-med-${med.id}`} data-hold={med.holdStatus}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <Pill aria-hidden className="size-3.5 text-muted-foreground" />
                        {med.name} <span className="font-normal text-muted-foreground tabular-nums">{med.dose} · {med.frequency}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{MED_CLASS_LABEL[med.medClass]}</p>
                    </div>
                    {med.holdRule && (
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", status.tone)}>
                        <StatusIcon aria-hidden className="size-3" />
                        {status.label}
                      </span>
                    )}
                  </div>
                  {med.holdRule && (
                    <div className="rounded-md bg-muted/60 px-3 py-2 text-xs">
                      <p className="font-medium text-foreground">{med.holdRule.instruction}</p>
                      <p className="text-muted-foreground">
                        Hold window {holdWindowLabel(med.holdRule.daysBefore)} · {lastDoseText(med, scheduledStart)}
                      </p>
                      <p className="text-muted-foreground">Source: {med.holdRule.source}</p>
                    </div>
                  )}
                  {med.holdRule && med.holdStatus !== "confirmed" && med.holdStatus !== "not_required" && !locked && (
                    <div className="flex flex-wrap gap-2" role="group" aria-label={`Hold decision for ${med.name}`}>
                      {DECISIONS.filter((decision) => decision.status !== med.holdStatus).map((decision) => (
                        <Button
                          key={decision.status}
                          size="sm"
                          variant={decision.variant}
                          className="min-h-11 px-3"
                          disabled={save.isPending}
                          onClick={() => decide(med, decision.status)}
                          data-testid={`hp-med-${med.id}-${decision.status}`}
                        >
                          {decision.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {notHeld && <GateChecklist result={holds} title="Hold rules not met — discuss with the surgeon before proceeding" />}
        </div>
      )}
    </SectionCard>
  );
}
