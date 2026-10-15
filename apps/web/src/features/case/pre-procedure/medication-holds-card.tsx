"use client";

import { useState } from "react";
import { ApiError } from "@asc/api-client";
import { useSaveHp, useSubmitAnticoagulationMutation } from "@asc/api-client/react";
import {
  classifyAnticoagulant,
  evaluateAnticoagulationHold,
  getAsgeRecommendation,
  isAnticoagulantOrAntiplatelet,
  medHoldCheck,
  type ProcedureBleedingRisk,
} from "@asc/clinical-rules";
import { formatDate } from "@asc/clinical-rules/time";
import type { HoldStatus, Medication } from "@asc/types";
import {
  Button,
  Checkbox,
  cn,
  GateChecklist,
  Input,
  Label,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@asc/ui";
import { AlertTriangle, CheckCircle2, ClipboardCheck, LoaderCircle, Pill, ShieldCheck } from "@asc/ui/icons";
import { HOLD_STATUS_META, MED_CLASS_LABEL, holdWindowLabel } from "./hp-config";

interface MedicationHoldsCardProps {
  readonly caseId: string;
  readonly medications: readonly Medication[];
  readonly scheduledStart: string;
  readonly holdsReviewed: boolean;
  /** H&P already signed — hold decisions are locked (no addenda in the demo). */
  readonly locked: boolean;
  readonly facilityId?: string;
  readonly procedureBleedingRisk?: ProcedureBleedingRisk;
}

interface AnticoagItemState {
  readonly prescriberInstructionDate: string;
  readonly prescriberInstruction: string;
  readonly prescriberName: string;
  readonly patientConfirmedHeld: boolean;
  readonly lastDoseTakenAt: string;
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

/** Medication list with hold rules from @asc/clinical-rules and ASGE anticoagulation assessment engine. */
export function MedicationHoldsCard({
  caseId,
  medications,
  scheduledStart,
  holdsReviewed,
  locked,
  facilityId = "main",
  procedureBleedingRisk = "high",
}: MedicationHoldsCardProps) {
  const save = useSaveHp(caseId);
  const submitAnticoagMutation = useSubmitAnticoagulationMutation(caseId, facilityId);

  const [bleedingRisk, setBleedingRisk] = useState<ProcedureBleedingRisk>(procedureBleedingRisk);
  const [anticoagState, setAnticoagState] = useState<Record<string, AnticoagItemState>>({});

  const holds = medHoldCheck(medications);
  const notHeld = medications.some((med) => med.holdRule && med.holdStatus === "not_held");
  const pending = medications.some((med) => med.holdRule && med.holdStatus === "pending");

  const anticoagMeds = medications.filter(isAnticoagulantOrAntiplatelet);

  const updateAnticoagItem = (medId: string, patch: Partial<AnticoagItemState>) => {
    setAnticoagState((prev) => {
      const current = prev[medId] ?? {
        prescriberInstructionDate: "",
        prescriberInstruction: "",
        prescriberName: "",
        patientConfirmedHeld: false,
        lastDoseTakenAt: "",
      };
      return {
        ...prev,
        [medId]: {
          ...current,
          ...patch,
        },
      };
    });
  };

  const assessments = anticoagMeds.map((med) => {
    const item = anticoagState[med.id];
    return {
      medicationId: med.id,
      prescriberInstructionDate: item?.prescriberInstructionDate || null,
      prescriberInstruction: item?.prescriberInstruction || null,
      patientConfirmedHeld:
        item?.patientConfirmedHeld !== undefined
          ? item.patientConfirmedHeld
          : med.holdStatus === "confirmed"
            ? true
            : med.holdStatus === "not_held"
              ? false
              : null,
      lastDoseTakenAt: item?.lastDoseTakenAt || med.lastTakenAt || null,
    };
  });

  const anticoagEval = evaluateAnticoagulationHold({
    medications: anticoagMeds,
    procedureBleedingRisk: bleedingRisk,
    assessments,
  });

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

  const handleSubmitAnticoag = async () => {
    try {
      await submitAnticoagMutation.mutateAsync({
        caseId,
        facilityId: facilityId.trim() || "main",
        hasAnticoagulants: anticoagMeds.length > 0,
        procedureBleedingRisk: bleedingRisk,
        medications: anticoagMeds.map((med) => {
          const item = anticoagState[med.id];
          return {
            medicationId: med.id,
            medicationName: med.name,
            drugClass: classifyAnticoagulant(med.name) ?? undefined,
            prescriberInstructionDate: item?.prescriberInstructionDate || undefined,
            prescriberInstruction: item?.prescriberInstruction || undefined,
            prescriberName: item?.prescriberName || undefined,
            patientConfirmedHeld:
              item?.patientConfirmedHeld !== undefined
                ? item.patientConfirmedHeld
                : med.holdStatus === "confirmed"
                  ? true
                  : med.holdStatus === "not_held"
                    ? false
                    : undefined,
            lastDoseTakenAt: item?.lastDoseTakenAt || med.lastTakenAt || undefined,
          };
        }),
      });
      toast.success("Anticoagulation clearance assessment recorded successfully");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to record anticoagulation assessment";
      toast.error(message);
    }
  };

  const handleClearNoAnticoag = async () => {
    try {
      await submitAnticoagMutation.mutateAsync({
        caseId,
        facilityId: facilityId.trim() || "main",
        hasAnticoagulants: false,
        procedureBleedingRisk: bleedingRisk,
        medications: [],
      });
      toast.success("Anticoagulation cleared: patient has no active anticoagulants or antiplatelets");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to clear anticoagulation";
      toast.error(message);
    }
  };

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
        <div className="space-y-6">
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

          {/* ASGE Anticoagulation Hold Decision Engine Section */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-4" data-testid="asge-anticoag-section">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div className="space-y-0.5">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-primary shrink-0" aria-hidden />
                  ASGE 2022 Anticoagulation &amp; Antiplatelet Clearance
                </h4>
                <p className="text-xs text-muted-foreground">
                  Evaluates bleeding risk, recommended hold duration, prescriber instructions, and day-of patient hold verification (Gate 2 clearance).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Label htmlFor="bleeding-risk-select" className="text-xs font-medium text-muted-foreground">
                  Bleeding Risk:
                </Label>
                <Select
                  value={bleedingRisk}
                  onValueChange={(val) => setBleedingRisk(val as ProcedureBleedingRisk)}
                >
                  <SelectTrigger id="bleeding-risk-select" className="min-h-11 w-44 text-xs" data-testid="bleeding-risk-select">
                    <SelectValue placeholder="Select Risk" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High Risk (Polypectomy/EMR)</SelectItem>
                    <SelectItem value="low">Low Risk (Diagnostic EGD)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {anticoagMeds.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/40 p-3 text-xs">
                <p className="text-muted-foreground">
                  No active anticoagulants or antiplatelets detected in patient medication profile.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => void handleClearNoAnticoag()}
                  disabled={locked || submitAnticoagMutation.isPending}
                  data-testid="clear-no-anticoag-button"
                >
                  {submitAnticoagMutation.isPending ? (
                    <LoaderCircle className="animate-spin size-4" />
                  ) : (
                    <CheckCircle2 className="size-4 text-success" />
                  )}
                  Confirm No Anticoagulants (Gate 2 Clear)
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Medication</TableHead>
                      <TableHead className="text-xs">Class</TableHead>
                      <TableHead className="text-xs">ASGE Recommendation</TableHead>
                      <TableHead className="text-xs">Prescriber Hold Instruction</TableHead>
                      <TableHead className="text-xs">Day-of Patient Hold</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {anticoagMeds.map((med) => {
                      const rec = getAsgeRecommendation(med, bleedingRisk);
                      const item = anticoagState[med.id];
                      const confirmed =
                        item?.patientConfirmedHeld !== undefined
                          ? item.patientConfirmedHeld
                          : med.holdStatus === "confirmed";

                      return (
                        <TableRow key={med.id} data-testid={`asge-med-row-${med.id}`}>
                          <TableCell className="align-top py-3 text-xs font-medium">
                            <div className="space-y-0.5">
                              <p className="font-semibold text-foreground">{med.name}</p>
                              <p className="text-muted-foreground">{med.dose} · {med.frequency}</p>
                            </div>
                          </TableCell>
                          <TableCell className="align-top py-3 text-xs">
                            <span className="inline-block rounded bg-primary/10 px-2 py-0.5 font-medium uppercase text-[10px] text-primary">
                              {rec.drugClass}
                            </span>
                          </TableCell>
                          <TableCell className="align-top py-3 text-xs max-w-xs space-y-1">
                            <p className="font-medium text-foreground">{rec.recommendationText}</p>
                            <p className="text-[11px] text-muted-foreground">
                              Hold window: <strong>{rec.recommendedHoldHours} hours</strong>
                            </p>
                          </TableCell>
                          <TableCell className="align-top py-3 text-xs space-y-2 min-w-44">
                            <Input
                              type="date"
                              value={item?.prescriberInstructionDate ?? ""}
                              onChange={(e) => updateAnticoagItem(med.id, { prescriberInstructionDate: e.target.value })}
                              className="min-h-11 text-xs"
                              placeholder="Instruction Date"
                              aria-label={`Prescriber instruction date for ${med.name}`}
                              data-testid={`prescriber-date-${med.id}`}
                            />
                            <Input
                              value={item?.prescriberInstruction ?? ""}
                              onChange={(e) => updateAnticoagItem(med.id, { prescriberInstruction: e.target.value })}
                              className="min-h-11 text-xs"
                              placeholder="e.g. Hold 48h per prescriber"
                              aria-label={`Prescriber instruction for ${med.name}`}
                              data-testid={`prescriber-instruction-${med.id}`}
                            />
                          </TableCell>
                          <TableCell className="align-top py-3 text-xs min-w-40">
                            <label className="flex items-center gap-2 cursor-pointer min-h-11">
                              <Checkbox
                                checked={confirmed}
                                onCheckedChange={(checked) =>
                                  updateAnticoagItem(med.id, { patientConfirmedHeld: checked === true })
                                }
                                className="size-5 shrink-0"
                                data-testid={`patient-confirmed-held-${med.id}`}
                              />
                              <span className="text-xs font-medium text-foreground">
                                Patient confirms held
                              </span>
                            </label>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* Evaluation Status Banner */}
                <div
                  className={cn(
                    "rounded-md border p-3 text-xs flex flex-wrap items-center justify-between gap-3",
                    anticoagEval.status === "satisfied" && "border-success/30 bg-success/10 text-success",
                    anticoagEval.status === "pending" && "border-warning/30 bg-warning/10 text-warning",
                    anticoagEval.status === "failed" && "border-destructive/30 bg-destructive/10 text-destructive",
                  )}
                  data-testid="anticoag-eval-status"
                >
                  <div className="flex items-center gap-2">
                    {anticoagEval.status === "satisfied" ? (
                      <CheckCircle2 className="size-4 shrink-0 text-success" />
                    ) : (
                      <AlertTriangle className="size-4 shrink-0" />
                    )}
                    <span>{anticoagEval.message}</span>
                  </div>

                  <Button
                    size="sm"
                    className="min-h-11 px-4 flex items-center gap-1.5 shrink-0"
                    onClick={() => void handleSubmitAnticoag()}
                    disabled={locked || submitAnticoagMutation.isPending}
                    data-testid="submit-anticoagulation-button"
                  >
                    {submitAnticoagMutation.isPending ? (
                      <LoaderCircle className="animate-spin size-4" />
                    ) : (
                      <ShieldCheck className="size-4" />
                    )}
                    Record Anticoagulation Assessment
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
