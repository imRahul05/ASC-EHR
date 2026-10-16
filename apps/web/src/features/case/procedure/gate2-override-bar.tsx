"use client";

import { useState } from "react";
import { useOverrideGate2 } from "@asc/api-client/react";
import type { CaseDetail } from "@asc/types";
import { Button, Input, Label, toast } from "@asc/ui";
import { CheckCircle2, LoaderCircle, ShieldAlert, ShieldCheck } from "@asc/ui/icons";
import { notifyError } from "../notify-error";

interface Gate2OverrideBarProps {
  readonly detail: CaseDetail;
  readonly onOverridden?: () => void;
}

interface OverrideFormState {
  readonly reason: string;
  readonly isOpen: boolean;
}

/**
 * Gate 2 Clinical Override Bar (CMS 42 CFR § 416.52 & Master Build Spec AC-F-06-1, AC-F-06-2, AC-I-05-4).
 * Permits authorized physicians/anesthesiologists to override non-scope readiness blockers (e.g. escort).
 * Strictly forbids overrides when active endoscope reprocessing/hang-time lock violations exist.
 */
export function Gate2OverrideBar({ detail, onOverridden }: Gate2OverrideBarProps) {
  const caseId = detail.case.id;
  const scopeLockViolation = detail.scopeAssignment
    ? !detail.scopeAssignment.withinHangTimeWindow ||
      detail.scopeAssignment.leakTestResult === "FAIL" ||
      detail.scopeAssignment.cycleOutcome === "FAIL"
    : false;
  const existingOverride = detail.gate2Override;
  const overrideMutation = useOverrideGate2(caseId);

  const [form, setForm] = useState<OverrideFormState>(() => ({
    reason: "",
    isOpen: false,
  }));

  const handleOverride = () => {
    if (form.reason.trim().length < 10) {
      toast.error("Override justification must be at least 10 characters");
      return;
    }

    overrideMutation.mutate(
      {
        reason: form.reason.trim(),
      },
      {
        onSuccess: () => {
          toast.success("Gate 2 clinical override recorded");
          setForm((prev) => ({ ...prev, isOpen: false, reason: "" }));
          onOverridden?.();
        },
        onError: notifyError("Could not record Gate 2 override"),
      },
    );
  };

  if (existingOverride) {
    return (
      <div
        className="flex items-center justify-between rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs"
        data-testid="gate2-override-active"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-warning" aria-hidden />
          <span>
            <strong className="font-semibold text-warning">Gate 2 Clinically Overridden</strong> by{" "}
            {existingOverride.actorName} ({existingOverride.actorRole}): &ldquo;{existingOverride.reason}&rdquo;
          </span>
        </div>
        <span className="text-muted-foreground">{new Date(existingOverride.overriddenAt).toLocaleTimeString()}</span>
      </div>
    );
  }

  if (scopeLockViolation) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
        data-testid="gate2-override-lockout"
      >
        <ShieldAlert className="size-4 shrink-0" aria-hidden />
        <span>
          <strong>Hard Gate 2 Lockout:</strong> Endoscope reprocessing or hang-time violation active (&gt;168h, leak test, or AER cycle failure). Per ST91:2021, Gate 2 has
          ZERO clinical override allowance across all roles. Scope must be reprocessed.
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 text-xs" data-testid="gate2-override-bar">
      {!form.isOpen ? (
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">
            Non-scope readiness blockers present? Attending physician or anesthesia provider may clinically override.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setForm((prev) => ({ ...prev, isOpen: true }))}
            data-testid="gate2-override-open-btn"
          >
            Clinical Override
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Clinical Blocker Override (Gate 2)</span>
            <span className="text-muted-foreground">Requires MD/DO or CRNA role</span>
          </div>

          <p className="text-xs text-muted-foreground">
            Audit trail will be bound directly to your authenticated clinician credentials (CMS 42 CFR § 416.52).
          </p>

          <div className="space-y-1">
            <Label htmlFor="override-reason">Override Justification (≥ 10 characters)</Label>
            <Input
              id="override-reason"
              placeholder="e.g. Escort confirmed via phone; private ride arriving by PACU discharge"
              value={form.reason}
              onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
              data-testid="override-reason-input"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setForm((prev) => ({ ...prev, isOpen: false }))}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={form.reason.trim().length < 10 || overrideMutation.isPending}
              onClick={handleOverride}
              data-testid="override-submit-btn"
            >
              {overrideMutation.isPending ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />}
              Record Override
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
