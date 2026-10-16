"use client";

import { useState } from "react";
import { useAssignScope } from "@asc/api-client/react";
import { MAXIMUM_SCOPE_HANG_TIME_HOURS } from "@asc/clinical-rules";
import type { CaseDetail } from "@asc/types";
import { Button, Input, Label, SectionCard, toast } from "@asc/ui";
import { CheckCircle2, Clock, LoaderCircle, ShieldAlert, Sparkles } from "@asc/ui/icons";
import { notifyError } from "../notify-error";

interface ScopeAssignmentCardProps {
  readonly detail: CaseDetail;
  readonly editable?: boolean;
}

interface ScopeFormState {
  readonly serial: string;
  readonly model: string;
  readonly reprocessedAt: string;
  readonly leakTest: "PASS" | "FAIL";
  readonly cycleOutcome: "PASS" | "FAIL";
  readonly isEditing: boolean;
}

function initialFormState(detail: CaseDetail): ScopeFormState {
  const scope = detail.scopeAssignment;
  const defaultReprocessed = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 16);
  return {
    serial: scope?.scopeSerial ?? "",
    model: scope?.scopeModel ?? "CF-H190L",
    reprocessedAt: scope?.reprocessedAt ? scope.reprocessedAt.slice(0, 16) : defaultReprocessed,
    leakTest: scope?.leakTestResult ?? "PASS",
    cycleOutcome: scope?.cycleOutcome ?? "PASS",
    isEditing: !scope,
  };
}

/**
 * Endoscope Assignment Card (ANSI/AAMI ST91:2021 & CMS 42 CFR § 416.44(b)).
 * Tracks endoscope serial, AER reprocessing timestamp, leak testing, and
 * enforces the strict 168-hour hang-time sterile storage threshold.
 */
export function ScopeAssignmentCard({ detail, editable = true }: ScopeAssignmentCardProps) {
  const caseId = detail.case.id;
  const scope = detail.scopeAssignment;
  const assignScopeMutation = useAssignScope(caseId);

  const [form, setForm] = useState<ScopeFormState>(() => initialFormState(detail));

  const handleAssign = () => {
    if (!form.serial.trim()) {
      toast.error("Please enter scope serial number");
      return;
    }

    const isoReprocessed = new Date(form.reprocessedAt).toISOString();
    assignScopeMutation.mutate(
      {
        scopeSerial: form.serial.trim(),
        scopeModel: form.model.trim() || undefined,
        reprocessedAt: isoReprocessed,
        leakTestResult: form.leakTest,
        cycleOutcome: form.cycleOutcome,
      },
      {
        onSuccess: () => {
          toast.success("Endoscope assigned and verified");
          setForm((prev) => ({ ...prev, isEditing: false }));
        },
        onError: notifyError("Could not assign endoscope"),
      },
    );
  };

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2 text-base font-semibold">
          <Clock className="size-5 text-primary" aria-hidden />
          Endoscope &amp; Reprocessing Verification
        </span>
      }
      description="ST91:2021 compliance: Verified sterile reprocessing, leak test, and ≤ 168-hour hang time."
      data-testid="scope-assignment-card"
    >
      {scope && !form.isEditing ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-muted/20 p-4 text-sm md:grid-cols-4">
            <div>
              <span className="text-xs text-muted-foreground uppercase">Scope Serial</span>
              <p className="font-semibold" data-testid="scope-serial-display">{scope.scopeSerial}</p>
              {scope.scopeModel && <p className="text-xs text-muted-foreground">{scope.scopeModel}</p>}
            </div>
            <div>
              <span className="text-xs text-muted-foreground uppercase">Reprocessed</span>
              <p className="font-medium">{new Date(scope.reprocessedAt).toLocaleString()}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground uppercase">Hang Time</span>
              <p
                className={`font-semibold tabular-nums ${scope.withinHangTimeWindow ? "text-success" : "text-destructive"}`}
                data-testid="scope-hang-time"
              >
                {scope.hangTimeHours}h / {MAXIMUM_SCOPE_HANG_TIME_HOURS}h max
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground uppercase">Status</span>
              <div className="mt-0.5">
                {scope.withinHangTimeWindow ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                    <CheckCircle2 className="size-4" aria-hidden /> Cleared
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive">
                    <ShieldAlert className="size-4" aria-hidden /> Locked (&gt;168h)
                  </span>
                )}
              </div>
            </div>
          </div>

          {!scope.withinHangTimeWindow && (
            <div
              className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
              data-testid="scope-lock-alert"
              role="alert"
            >
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">ST91:2021 Endoscope Hang-Time Lock Active</p>
                <p>
                  Scope hang time exceeds 168 hours or decontamination cycle failed. This scope cannot be used for
                  patient procedures and cannot be overridden by any role. Re-cleaning required.
                </p>
              </div>
            </div>
          )}

          {editable && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setForm((prev) => ({ ...prev, isEditing: true }))}
                data-testid="scope-reassign-btn"
              >
                Change Scope Assignment
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="scope-serial-input">Scope Serial Number</Label>
              <Input
                id="scope-serial-input"
                placeholder="e.g. SN-OLY-7489"
                value={form.serial}
                onChange={(e) => setForm((prev) => ({ ...prev, serial: e.target.value }))}
                data-testid="scope-serial-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scope-model-input">Scope Model</Label>
              <Input
                id="scope-model-input"
                placeholder="e.g. CF-H190L"
                value={form.model}
                onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))}
                data-testid="scope-model-input"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="scope-reprocess-date">AER Cycle Timestamp</Label>
              <Input
                id="scope-reprocess-date"
                type="datetime-local"
                value={form.reprocessedAt}
                onChange={(e) => setForm((prev) => ({ ...prev, reprocessedAt: e.target.value }))}
                data-testid="scope-reprocessed-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scope-leak-test">Leak Test</Label>
              <select
                id="scope-leak-test"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs"
                value={form.leakTest}
                onChange={(e) => setForm((prev) => ({ ...prev, leakTest: e.target.value as "PASS" | "FAIL" }))}
                data-testid="scope-leak-test-select"
              >
                <option value="PASS">PASS</option>
                <option value="FAIL">FAIL</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scope-cycle-outcome">AER Disinfection Cycle</Label>
              <select
                id="scope-cycle-outcome"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs"
                value={form.cycleOutcome}
                onChange={(e) => setForm((prev) => ({ ...prev, cycleOutcome: e.target.value as "PASS" | "FAIL" }))}
                data-testid="scope-cycle-outcome-select"
              >
                <option value="PASS">PASS</option>
                <option value="FAIL">FAIL</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            {scope && (
              <Button variant="ghost" size="sm" onClick={() => setForm((prev) => ({ ...prev, isEditing: false }))}>
                Cancel
              </Button>
            )}
            <Button
              size="sm"
              disabled={assignScopeMutation.isPending}
              onClick={handleAssign}
              data-testid="scope-assign-submit"
            >
              {assignScopeMutation.isPending ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
              Verify &amp; Assign Scope
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
