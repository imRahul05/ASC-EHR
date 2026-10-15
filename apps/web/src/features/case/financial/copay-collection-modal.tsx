"use client";

import { useState } from "react";
import { useCollectCopay } from "@asc/api-client/react";
import type { CopayCollectionResult } from "@asc/types";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  toast,
} from "@asc/ui";
import { CreditCard, LoaderCircle, Receipt } from "@asc/ui/icons";

interface CopayCollectionModalProps {
  readonly caseId: string;
  readonly patientOwedCents: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCollectionComplete?: (result: CopayCollectionResult) => void;
}

interface CollectionFormState {
  amountStr: string;
  paymentMethod: "credit_card" | "debit_card" | "cash" | "check" | "payment_plan";
  transactionRef: string;
  notes: string;
  monthlyStr: string;
  numberOfMonths: number;
  firstDueDate: string;
}

/**
 * Front-Desk Copay & Deductible Collection Modal
 *
 * Implements receipting of patient financial liabilities at check-in or booking.
 * Supports credit card, debit, cash, check, and installment payment plan scheduling.
 * All amounts are strictly converted to integer cents prior to API dispatch.
 */
export function CopayCollectionModal({
  caseId,
  patientOwedCents,
  open,
  onOpenChange,
  onCollectionComplete,
}: CopayCollectionModalProps) {
  const [formState, setFormState] = useState<CollectionFormState>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return {
      amountStr: (patientOwedCents / 100).toFixed(2),
      paymentMethod: "credit_card",
      transactionRef: "",
      notes: "",
      monthlyStr: "50.00",
      numberOfMonths: 6,
      firstDueDate: d.toISOString().slice(0, 10),
    };
  });

  const collectMutation = useCollectCopay(caseId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const dollars = Number.parseFloat(formState.amountStr);
    if (Number.isNaN(dollars) || dollars < 0) {
      toast.error("Please enter a valid positive collection amount");
      return;
    }

    const amountCents = Math.round(dollars * 100);

    let paymentPlanDetails:
      | { monthlyCents: number; numberOfMonths: number; firstDueDate: string }
      | undefined = undefined;

    if (formState.paymentMethod === "payment_plan") {
      const monthly = Number.parseFloat(formState.monthlyStr);
      if (Number.isNaN(monthly) || monthly <= 0) {
        toast.error("Please enter a valid monthly payment plan amount");
        return;
      }
      paymentPlanDetails = {
        monthlyCents: Math.round(monthly * 100),
        numberOfMonths: formState.numberOfMonths,
        firstDueDate: formState.firstDueDate,
      };
    }

    try {
      const res = await collectMutation.mutateAsync({
        caseId,
        amountCents,
        paymentMethod: formState.paymentMethod,
        transactionRef: formState.transactionRef.trim() || undefined,
        paymentPlanDetails,
        notes: formState.notes.trim() || undefined,
      });

      toast.success(
        `Collected $${(amountCents / 100).toFixed(2)} via ${formState.paymentMethod.replace("_", " ")}`
      );
      onCollectionComplete?.(res);
      onOpenChange(false);
    } catch {
      toast.error("Failed to record copay collection");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="copay-collection-modal">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Receipt className="size-5 text-primary shrink-0" aria-hidden />
            <DialogTitle className="text-base font-semibold">Front-Desk Copay Collection</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Collect patient deductible, coinsurance, or copay and issue an electronic transaction receipt.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 py-2 text-sm">
          <div className="space-y-1.5">
            <Label htmlFor="collection-amount-input" className="text-xs font-medium">
              Amount to Collect ($ USD)
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id="collection-amount-input"
                type="number"
                step="0.01"
                min="0"
                value={formState.amountStr}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormState((prev) => ({ ...prev, amountStr: val }));
                }}
                className="pl-7 min-h-11 tabular-nums text-sm font-semibold"
                data-testid="collection-amount-input"
                required
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Total estimated patient responsibility: ${(patientOwedCents / 100).toFixed(2)}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment-method-select" className="text-xs font-medium">
              Payment Method
            </Label>
            <select
              id="payment-method-select"
              value={formState.paymentMethod}
              onChange={(e) => {
                const val = e.target.value as "credit_card" | "debit_card" | "cash" | "check" | "payment_plan";
                setFormState((prev) => ({ ...prev, paymentMethod: val }));
              }}
              className="w-full min-h-11 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="payment-method-select"
            >
              <option value="credit_card">Credit Card (Swipe / Chip / Contactless)</option>
              <option value="debit_card">Debit Card</option>
              <option value="cash">Cash</option>
              <option value="check">Personal Check</option>
              <option value="payment_plan">Installment Payment Plan (Deferred)</option>
            </select>
          </div>

          {formState.paymentMethod === "payment_plan" ? (
            <div
              className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3"
              data-testid="payment-plan-section"
            >
              <div className="text-xs font-semibold text-primary">Deferred Installment Agreement</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="monthly-plan-input" className="text-[11px]">
                    Monthly ($)
                  </Label>
                  <Input
                    id="monthly-plan-input"
                    type="number"
                    step="0.01"
                    value={formState.monthlyStr}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormState((prev) => ({ ...prev, monthlyStr: val }));
                    }}
                    className="min-h-11 text-xs"
                    data-testid="monthly-plan-input"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="duration-months-input" className="text-[11px]">
                    Months
                  </Label>
                  <Input
                    id="duration-months-input"
                    type="number"
                    min="1"
                    max="36"
                    value={formState.numberOfMonths}
                    onChange={(e) => {
                      const val = Number.parseInt(e.target.value, 10) || 1;
                      setFormState((prev) => ({ ...prev, numberOfMonths: val }));
                    }}
                    className="min-h-11 text-xs"
                    data-testid="duration-months-input"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="first-due-date-input" className="text-[11px]">
                  First Due Date
                </Label>
                <Input
                  id="first-due-date-input"
                  type="date"
                  value={formState.firstDueDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormState((prev) => ({ ...prev, firstDueDate: val }));
                  }}
                  className="min-h-11 text-xs"
                  data-testid="first-due-date-input"
                  required
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="transaction-ref-input" className="text-xs font-medium">
                POS Transaction / Auth Ref (Optional)
              </Label>
              <Input
                id="transaction-ref-input"
                placeholder="e.g. TX-984210"
                value={formState.transactionRef}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormState((prev) => ({ ...prev, transactionRef: val }));
                }}
                className="min-h-11 text-sm font-mono"
                data-testid="transaction-ref-input"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="collection-notes-input" className="text-xs font-medium">
              Notes / Receipt Memo
            </Label>
            <Input
              id="collection-notes-input"
              placeholder="e.g. Collected at front desk check-in"
              value={formState.notes}
              onChange={(e) => {
                const val = e.target.value;
                setFormState((prev) => ({ ...prev, notes: val }));
              }}
              className="min-h-11 text-sm"
              data-testid="collection-notes-input"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <DialogClose render={<Button variant="outline" type="button" className="min-h-11 text-xs" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              className="min-h-11 text-xs"
              disabled={collectMutation.isPending}
              data-testid="confirm-collection-button"
            >
              {collectMutation.isPending ? (
                <>
                  <LoaderCircle className="size-4 mr-1.5 animate-spin" aria-hidden />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="size-4 mr-1.5" aria-hidden />
                  Receipt Payment
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
