"use client";

import { useState } from "react";
import { useFinancialSummary } from "@asc/api-client/react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  LoadingSkeleton,
  cn,
} from "@asc/ui";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "@asc/ui/icons";

import { CopayCollectionModal } from "./copay-collection-modal";
import { EligibilityCheckModal } from "./eligibility-check-modal";
import { GfeEstimateCard } from "./gfe-estimate-card";

interface FinancialClearanceCardProps {
  readonly caseId: string;
  readonly facilityId?: string;
  readonly className?: string;
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/**
 * Financial Clearance & Real-Time Eligibility Card
 *
 * Primary case workspace module for:
 * 1. Real-time ANSI X12 270/271 benefit verification (deductibles, copays, out-of-pocket maximums).
 * 2. Incomplete / degraded 271 response detection (Review Focus #1).
 * 3. HIPAA X12 278 prior authorization validity tracking and reschedule rechecks (Review Focus #2).
 * 4. Dual Good-Faith Estimates under ACA 42 U.S.C. § 300gg-13 and No Surprises Act 45 CFR § 149 (Review Focus #3).
 * 5. Front-desk copay/deductible collection and installment payment plans (Review Focus #5).
 */
export function FinancialClearanceCard({
  caseId,
  facilityId,
  className,
}: FinancialClearanceCardProps) {
  const [isEligibilityOpen, setIsEligibilityOpen] = useState(false);
  const [isCopayOpen, setIsCopayOpen] = useState(false);

  const {
    data: summary,
    isPending,
    isError,
    refetch,
  } = useFinancialSummary(caseId, facilityId);

  if (isPending) {
    return <LoadingSkeleton variant="detail" className={className} />;
  }

  if (isError || !summary) {
    return (
      <ErrorState
        title="Could not load financial clearance"
        message="Unable to retrieve real-time eligibility or benefit estimate for this case."
        onRetry={() => void refetch()}
        className={className}
      />
    );
  }

  const isCleared = summary.isCleared;
  const isDegraded = summary.eligibilityStatus === "incomplete";

  return (
    <div className={cn("space-y-4", className)} data-testid="financial-clearance-card">
      <Card className="border border-border shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary shrink-0" aria-hidden />
                <CardTitle className="text-base font-semibold">Financial Clearance &amp; Benefits</CardTitle>
              </div>
              <CardDescription className="text-xs text-muted-foreground">
                Automated 270/271 real-time eligibility monitoring, 278 prior auth revalidation, and GFE estimates.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              {isCleared ? (
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium gap-1 py-1"
                  data-testid="clearance-badge-cleared"
                >
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  Financially Cleared
                </Badge>
              ) : summary.overallStatus === "pending" ? (
                <Badge
                  variant="outline"
                  className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium gap-1 py-1"
                  data-testid="clearance-badge-pending"
                >
                  <AlertTriangle className="size-3.5" aria-hidden />
                  Pending Clearance
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-destructive/40 bg-destructive/10 text-destructive font-medium gap-1 py-1"
                  data-testid="clearance-badge-action-required"
                >
                  <XCircle className="size-3.5" aria-hidden />
                  Action Required
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-0">
          {/* Degraded 271 Alert (Review Focus #1) */}
          {isDegraded && (
            <div
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5"
              data-testid="degraded-eligibility-alert"
            >
              <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" aria-hidden />
              <div className="space-y-1">
                <span className="font-semibold block">Incomplete 271 Benefit Response</span>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  The payer response confirmed active general medical plan coverage, but omitted GI endoscopy (Service Type 33) benefit specifics. A financial clearance work item has been created.
                </p>
              </div>
            </div>
          )}

          {/* Benefits & Payer details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
            <div className="space-y-1">
              <span className="text-muted-foreground font-medium block">Payer &amp; Plan</span>
              <div className="font-semibold text-foreground text-sm">{summary.planName}</div>
              <div className="flex items-center gap-1.5 pt-0.5">
                <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                  {summary.planType}
                </Badge>
                {summary.inNetwork && (
                  <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600 font-normal">
                    In-Network
                  </Badge>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-muted-foreground font-medium block">Deductible</span>
              <div className="font-semibold text-foreground text-sm tabular-nums">
                {formatCents(summary.deductibleRemainingCents)}{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  remaining of {formatCents(summary.deductibleCents)}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-muted-foreground font-medium block">Out-of-Pocket Max</span>
              <div className="font-semibold text-foreground text-sm tabular-nums">
                {formatCents(summary.outOfPocketRemainingCents)}{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  remaining of {formatCents(summary.outOfPocketMaxCents)}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-muted-foreground font-medium block">Prior Authorization (278)</span>
              <div className="flex items-center gap-2">
                <Badge
                  variant={summary.priorAuthStatus === "approved" ? "outline" : "destructive"}
                  className={`text-xs capitalize font-medium ${
                    summary.priorAuthStatus === "approved"
                      ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10"
                      : ""
                  }`}
                  data-testid={`prior-auth-badge-${summary.priorAuthStatus}`}
                >
                  <FileCheck2 className="size-3 mr-1" aria-hidden />
                  {summary.priorAuthStatus}
                </Badge>
                <span className="font-mono text-[11px] text-muted-foreground">{summary.authNumber}</span>
              </div>
            </div>
          </div>

          {/* Dual Good-Faith Estimate under ACA & No Surprises Act */}
          <GfeEstimateCard
            estimate={summary.estimate}
            deductibleRemainingCents={summary.deductibleRemainingCents}
            coinsurancePercent={summary.coinsurancePercent}
            copayCents={summary.copayCents}
            outOfPocketRemainingCents={summary.outOfPocketRemainingCents}
          />

          {/* Front-desk collection status & actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/80">
            <div className="flex items-center gap-4 text-xs">
              <div>
                <span className="text-muted-foreground block">Collected at Desk</span>
                <span className="font-semibold text-foreground tabular-nums text-sm">
                  {formatCents(summary.collectedCents)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block">Remaining Patient Balance</span>
                <span
                  className={cn(
                    "font-semibold tabular-nums text-sm",
                    summary.balanceRemainingCents > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"
                  )}
                >
                  {formatCents(summary.balanceRemainingCents)}
                </span>
              </div>
              {summary.hasPaymentPlan && (
                <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary text-[10px]">
                  Active Payment Plan
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="min-h-11 text-xs px-3"
                onClick={() => setIsEligibilityOpen(true)}
                data-testid="recheck-eligibility-button"
              >
                <RefreshCw className="size-3.5 mr-1.5" aria-hidden />
                Re-check Eligibility
              </Button>
              <Button
                className="min-h-11 text-xs px-3"
                onClick={() => setIsCopayOpen(true)}
                data-testid="collect-copay-button"
              >
                <CreditCard className="size-3.5 mr-1.5" aria-hidden />
                Collect Copay
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <EligibilityCheckModal
        caseId={caseId}
        open={isEligibilityOpen}
        onOpenChange={setIsEligibilityOpen}
        onCheckComplete={() => void refetch()}
      />

      <CopayCollectionModal
        caseId={caseId}
        patientOwedCents={summary.balanceRemainingCents || summary.estimate.patientResponsibilityCents}
        open={isCopayOpen}
        onOpenChange={setIsCopayOpen}
        onCollectionComplete={() => void refetch()}
      />
    </div>
  );
}
