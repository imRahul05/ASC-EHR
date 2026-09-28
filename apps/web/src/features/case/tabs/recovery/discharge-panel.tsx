"use client";

import { useState } from "react";
import { ApiError } from "@asc/api-client";
import { useDischargeCase, useSavePreOp } from "@asc/api-client/react";
import { finalDischargeGate } from "@asc/clinical-rules";
import type { CaseDetail } from "@asc/types";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  GateChecklist,
  Label,
  SectionCard,
  Switch,
  toast,
} from "@asc/ui";
import { DoorOpen, LoaderCircle } from "@asc/ui/icons";

interface DischargePanelProps {
  readonly detail: CaseDetail;
}

/** Discharge gate (Aldrete, escort, approved instructions), escort-present toggle and the discharge action with confirm. */
export function DischargePanel({ detail }: DischargePanelProps) {
  const [confirming, setConfirming] = useState(false);
  const caseId = detail.case.id;
  const savePreOp = useSavePreOp(caseId);
  const discharge = useDischargeCase(caseId);
  const escort = detail.patient.escort;
  const escortPresent = escort?.present ?? false;
  const gate = finalDischargeGate(detail.aldrete, escortPresent, detail.discharge);
  const ready = detail.case.phase === "READY_FOR_DISCHARGE";
  const patientName = detail.case.patient.displayName;

  const onEscort = (present: boolean) =>
    savePreOp.mutate(
      { escortPresent: present },
      { onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not update escort") },
    );

  const onDischarge = () =>
    discharge.mutate(
      { escortPresent },
      {
        onSuccess: () => toast.success(`${detail.case.caseNumber} discharged`),
        onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not discharge"),
        onSettled: () => setConfirming(false),
      },
    );

  return (
    <SectionCard
      title="Discharge"
      description={ready ? "All items must pass. The server re-checks on discharge." : "Move the case to Ready for discharge (side panel) once Aldrete and escort pass."}
      data-testid="recovery-discharge"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3">
          <div className="min-w-0">
            <Label htmlFor="recovery-escort-present">Escort present</Label>
            <p className="truncate text-xs text-muted-foreground">
              {escort ? `${escort.name} (${escort.relationship}) · ${escort.phone}` : "No escort on file — add one in the patient chart."}
            </p>
          </div>
          <Switch
            id="recovery-escort-present"
            checked={escortPresent}
            onCheckedChange={onEscort}
            disabled={!escort || savePreOp.isPending}
            data-testid="recovery-escort-toggle"
          />
        </div>
        <GateChecklist result={gate} title="Discharge gate" />
        <Button
          className="w-full"
          size="lg"
          disabled={!ready || !gate.ok || discharge.isPending}
          onClick={() => setConfirming(true)}
          data-testid="recovery-discharge-button"
        >
          <DoorOpen /> Discharge patient
        </Button>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discharge {patientName}?</DialogTitle>
            <DialogDescription>
              {patientName} · {detail.case.caseNumber} leaves the center with {escort?.name ?? "their escort"}. Approved instructions go to
              the patient portal. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Not yet</DialogClose>
            <Button onClick={onDischarge} disabled={discharge.isPending} data-testid="recovery-discharge-confirm">
              {discharge.isPending ? <LoaderCircle className="animate-spin" /> : <DoorOpen />}
              Discharge {patientName}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
