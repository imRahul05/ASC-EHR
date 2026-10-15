"use client";

import { useState } from "react";
import { useCaseEligibilityCheck } from "@asc/api-client/react";
import type { EligibilityCheckResult } from "@asc/types";
import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  toast,
} from "@asc/ui";
import { AlertTriangle, CheckCircle, LoaderCircle, RefreshCw, ShieldCheck } from "@asc/ui/icons";

interface EligibilityCheckModalProps {
  readonly caseId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCheckComplete?: (result: EligibilityCheckResult) => void;
}

/**
 * ANSI ASC X12 270/271 Real-Time Eligibility Verification Modal
 *
 * Allows front-desk staff to initiate an electronic benefit inquiry via clearinghouse
 * to verify coverage status, endoscopy service type (33/30), deductibles, copay, and OOP max.
 */
export function EligibilityCheckModal({
  caseId,
  open,
  onOpenChange,
  onCheckComplete,
}: EligibilityCheckModalProps) {
  const [modalState, setModalState] = useState<{
    serviceTypeCode: string;
    forceRefresh: boolean;
    result: EligibilityCheckResult | null;
  }>({
    serviceTypeCode: "33",
    forceRefresh: true,
    result: null,
  });

  const checkMutation = useCaseEligibilityCheck(caseId);

  const handleRunCheck = async () => {
    try {
      const res = await checkMutation.mutateAsync({
        caseId,
        serviceTypeCode: modalState.serviceTypeCode,
        forceRefresh: modalState.forceRefresh,
      });
      setModalState((prev) => ({ ...prev, result: res }));
      onCheckComplete?.(res);

      if (res.eligibility.status === "incomplete") {
        toast.warning("271 response received but GI endoscopy benefits are incomplete. Work item created.");
      } else if (res.eligibility.status === "active") {
        toast.success(`Active coverage confirmed for ${res.eligibility.planName}`);
      } else {
        toast.error(`Eligibility check returned ${res.eligibility.status}`);
      }
    } catch {
      toast.error("Failed to execute real-time eligibility check via clearinghouse");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="eligibility-check-modal">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary shrink-0" aria-hidden />
            <DialogTitle className="text-base font-semibold">Real-Time Eligibility Check (270/271)</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Execute HIPAA ANSI ASC X12 270 inquiry against payer clearinghouse to capture current copay, deductible, and endoscopy benefits.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          <div className="space-y-1.5">
            <Label htmlFor="service-type-select" className="text-xs font-medium">
              HIPAA Service Type Code
            </Label>
            <select
              id="service-type-select"
              value={modalState.serviceTypeCode}
              onChange={(e) => {
                const val = e.target.value;
                setModalState((prev) => ({ ...prev, serviceTypeCode: val }));
              }}
              className="w-full min-h-11 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="service-type-select"
            >
              <option value="33">33 — GI Endoscopy / Diagnostic Surgery</option>
              <option value="30">30 — Health Benefit Plan Coverage (General Medical)</option>
              <option value="47">47 — Hospital - Ambulatory Surgical</option>
            </select>
            <p className="text-[11px] text-muted-foreground">
              Per CMS guidelines, Ambulatory Surgery Centers verify specific GI endoscopy coverage (33) to prevent denial.
            </p>
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <Checkbox
              id="force-refresh-checkbox"
              checked={modalState.forceRefresh}
              onCheckedChange={(checked) =>
                setModalState((prev) => ({ ...prev, forceRefresh: Boolean(checked) }))
              }
              data-testid="force-refresh-checkbox"
            />
            <Label htmlFor="force-refresh-checkbox" className="text-xs font-normal cursor-pointer">
              Bypass cached 271 response and force real-time clearinghouse round-trip
            </Label>
          </div>

          {modalState.result && (
            <div
              className={`rounded-md p-3 text-xs space-y-1.5 border ${
                modalState.result.eligibility.status === "active"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                  : modalState.result.eligibility.status === "incomplete"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
              data-testid="eligibility-result-preview"
            >
              <div className="flex items-center gap-1.5 font-semibold">
                {modalState.result.eligibility.status === "active" ? (
                  <CheckCircle className="size-4 shrink-0" />
                ) : (
                  <AlertTriangle className="size-4 shrink-0" />
                )}
                <span>Payer Status: {modalState.result.eligibility.status.toUpperCase()}</span>
              </div>
              <p>Plan: {modalState.result.eligibility.planName} ({modalState.result.eligibility.planType})</p>
              {modalState.result.eligibility.status === "incomplete" && (
                <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                  Notice: Payer 271 did not return specific endoscopy benefit levels. Case readiness set to Pending.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <DialogClose render={<Button variant="outline" type="button" className="min-h-11 text-xs" />}>
            Close
          </DialogClose>
          <Button
            type="button"
            className="min-h-11 text-xs"
            onClick={() => void handleRunCheck()}
            disabled={checkMutation.isPending}
            data-testid="run-eligibility-inquiry-button"
          >
            {checkMutation.isPending ? (
              <>
                <LoaderCircle className="size-4 mr-1.5 animate-spin" aria-hidden />
                Querying Payer...
              </>
            ) : (
              <>
                <RefreshCw className="size-4 mr-1.5" aria-hidden />
                Run Real-Time Inquiry (270)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
