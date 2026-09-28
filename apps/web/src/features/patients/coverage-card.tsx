"use client";

import { ApiError } from "@asc/api-client";
import { useCheckEligibility } from "@asc/api-client/react";
import { formatDateTime } from "@asc/clinical-rules/time";
import type { Patient } from "@asc/types";
import { Button, EligibilityChip, SectionCard, toast } from "@asc/ui";
import { Loader2, ShieldCheck } from "@asc/ui/icons";
import { formatCents } from "./patient-ref";

interface CoverageCardProps {
  readonly patient: Patient;
  readonly className?: string;
}

const RELATIONSHIP_LABEL = { self: "Self", spouse: "Spouse", child: "Child", other: "Other" } as const;

/** Coverage + real-time eligibility (mock X12 270 → 271). */
export function CoverageCard({ patient, className }: CoverageCardProps) {
  const check = useCheckEligibility();
  const coverage = patient.coverage;
  const result = check.data ?? coverage?.eligibility ?? null;

  const run = async () => {
    try {
      const response = await check.mutateAsync(patient.id);
      toast.success(response.status === "active" ? "Eligibility active (271 received)" : `Eligibility ${response.status}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Eligibility check failed.");
    }
  };

  const rows = coverage
    ? [
        { label: "Payer", value: coverage.payer },
        { label: "Plan", value: coverage.planName || "—" },
        { label: "Member ID", value: <span className="font-mono">{coverage.memberId}</span> },
        { label: "Group", value: <span className="font-mono">{coverage.groupNumber ?? "—"}</span> },
        { label: "Subscriber", value: RELATIONSHIP_LABEL[coverage.subscriberRelationship] },
      ]
    : [];

  const resultRows = result
    ? [
        { label: "Copay", value: formatCents(result.copayCents) },
        { label: "Deductible left", value: formatCents(result.deductibleRemainingCents) },
        { label: "Checked", value: formatDateTime(result.checkedAt) },
        { label: "Transaction", value: <span className="font-mono text-[11px]">{result.transactionId}</span> },
      ]
    : [];

  return (
    <SectionCard
      title="Coverage & eligibility"
      description="X12 270 request → 271 response (mock clearinghouse)."
      className={className}
      data-testid="coverage-card"
      actions={
        coverage && (
          <Button size="sm" variant={result?.status === "active" ? "outline" : "default"} onClick={() => void run()} disabled={check.isPending} data-testid="coverage-check-eligibility">
            {check.isPending ? <Loader2 aria-hidden className="animate-spin" /> : <ShieldCheck aria-hidden />}
            {result ? "Re-check" : "Check eligibility"}
          </Button>
        )
      }
    >
      {!coverage ? (
        <p className="text-sm text-muted-foreground">No coverage on file — self-pay, or add a payer before booking.</p>
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {rows.map((row) => (
              <div key={row.label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{row.label}</dt>
                <dd className="truncate">{row.value}</dd>
              </div>
            ))}
          </dl>
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3" aria-live="polite" data-testid="coverage-eligibility-result">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">271 response</span>
              <EligibilityChip status={check.isPending ? "pending" : result?.status} />
            </div>
            {result ? (
              <>
                {result.message && <p className="text-sm">{result.message}</p>}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {resultRows.map((row) => (
                    <div key={row.label} className="min-w-0">
                      <dt className="text-muted-foreground">{row.label}</dt>
                      <dd className="truncate tabular-nums">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Not verified yet — run the check before confirming a case.</p>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
