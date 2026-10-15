"use client";

import { AlertCircle, CheckCircle2, FileSpreadsheet } from "@asc/ui/icons";
import type { FinancialEstimateBreakdown } from "@asc/types";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from "@asc/ui";

interface GfeEstimateCardProps {
  readonly estimate: FinancialEstimateBreakdown;
  readonly deductibleRemainingCents: number;
  readonly coinsurancePercent: number;
  readonly copayCents: number;
  readonly outOfPocketRemainingCents: number;
  readonly className?: string;
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/**
 * Good-Faith Estimate (GFE) Dual-Calculation Card
 *
 * Implements disclosures required under:
 * - Patient Protection and Affordable Care Act (42 U.S.C. § 300gg-13):
 *   Mandates $0 patient cost-sharing for preventive screening colonoscopies.
 * - No Surprises Act (45 CFR § 149):
 *   Requires advance itemized estimates detailing expected patient financial liability
 *   and cost-sharing contingencies when screening procedures become therapeutic (Modifier 33 / PT).
 */
export function GfeEstimateCard({
  estimate,
  deductibleRemainingCents,
  coinsurancePercent,
  copayCents,
  outOfPocketRemainingCents,
  className,
}: GfeEstimateCardProps) {
  return (
    <Card className={cn("border border-border/80 shadow-xs", className)} data-testid="gfe-estimate-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-primary shrink-0" aria-hidden />
            <CardTitle className="text-base font-semibold">Good-Faith Estimate (Dual Pricing)</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
            No Surprises Act (45 CFR § 149)
          </Badge>
        </div>
        <CardDescription className="text-xs text-muted-foreground">
          Federal law requires dual pricing transparency for GI endoscopy: preventive screening baseline vs. therapeutic polyp resection contingency.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        <div className="grid gap-3 md:grid-cols-2">
          {/* Option A: Preventive Screening */}
          <div
            className="flex flex-col justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3.5 space-y-2.5"
            data-testid="gfe-screening-breakdown"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm text-foreground">Screening Colonoscopy (Preventive)</span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  $0 Copay Mandate
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Under <strong>ACA 42 U.S.C. § 300gg-13</strong>, in-network preventive colorectal screening incurs zero copay, deductible, or coinsurance when no polyps are resected.
              </p>
            </div>

            <div className="pt-2 border-t border-emerald-500/20 flex items-baseline justify-between">
              <span className="text-xs font-medium text-muted-foreground">Estimated Patient Responsibility:</span>
              <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {formatCents(estimate.estimatedScreeningPatientOwedCents)}
              </span>
            </div>
          </div>

          {/* Option B: Therapeutic Polyp Removal Contingency */}
          <div
            className="flex flex-col justify-between rounded-lg border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-2.5"
            data-testid="gfe-therapeutic-breakdown"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm text-foreground">Therapeutic Resection Contingency</span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                  <AlertCircle className="size-3.5" aria-hidden />
                  Modifier 33 / PT
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                If polyps or abnormal lesions are biopsied/resected (e.g. CPT 45385), claim is adjudicated with therapeutic cost-sharing under payer contract.
              </p>
            </div>

            <div className="pt-2 border-t border-amber-500/20 flex items-baseline justify-between">
              <span className="text-xs font-medium text-muted-foreground">Contingency Patient Liability:</span>
              <span className="text-xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                {formatCents(estimate.estimatedTherapeuticPatientOwedCents)}
              </span>
            </div>
          </div>
        </div>

        {/* Benefits breakdown factors */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border/60 text-xs">
          <div>
            <span className="text-muted-foreground block">Remaining Deductible</span>
            <span className="font-semibold tabular-nums text-foreground">{formatCents(deductibleRemainingCents)}</span>
          </div>
          <div>
            <span className="text-muted-foreground block">Coinsurance Rate</span>
            <span className="font-semibold tabular-nums text-foreground">{coinsurancePercent}%</span>
          </div>
          <div>
            <span className="text-muted-foreground block">Copay Amount</span>
            <span className="font-semibold tabular-nums text-foreground">{formatCents(copayCents)}</span>
          </div>
          <div>
            <span className="text-muted-foreground block">Remaining OOP Max</span>
            <span className="font-semibold tabular-nums text-foreground">{formatCents(outOfPocketRemainingCents)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
