"use client";

import { AlertTriangle, FileSignature, HeartPulse, ShieldAlert, ShieldCheck, XCircle } from "@asc/ui/icons";
import { Button, cn } from "@asc/ui";

interface GateBlockerAlertProps {
  readonly reasons: readonly string[];
  readonly onOpenConsent?: () => void;
  readonly onOpenPreop?: () => void;
  readonly onOpenHpUpdate?: () => void;
  readonly onOpenHpOverride?: () => void;
  readonly onOpenFinancial?: () => void;
  readonly className?: string;
}

const REASON_MAPPING: Record<string, { title: string; description: string; action?: "consent" | "preop" | "hp" | "financial" }> = {
  GATE1_CONSENT: {
    title: "Informed Consent Required",
    description: "Informed consent must be digitally signed and procedure code verified before entering pre-op. Consent CANNOT be waived by any role.",
    action: "consent",
  },
  GATE1_IDENTITY: {
    title: "Patient Identity Verification Required",
    description: "Two-identifier patient wristband and verbal verification must be completed at arrival. Identity CANNOT be waived.",
  },
  GATE1_HP: {
    title: "History & Physical (H&P) Incomplete or Expired",
    description: "Valid H&P within 30 days must be completed and attested with a day-of interval update note by an attending physician, or clinically overridden.",
    action: "hp",
  },
  GATE0_FINANCIAL: {
    title: "Financial Clearance Required",
    description: "Active insurance eligibility (270/271) and approved prior authorization (278) must be verified before procedure confirmation.",
    action: "financial",
  },
  GATE0_COVERAGE: {
    title: "Active Insurance Coverage Required",
    description: "Real-time 270/271 inquiry returned inactive or degraded coverage. Insurance must be verified prior to confirming case.",
    action: "financial",
  },
  GATE0_AUTH: {
    title: "Prior Authorization Required or Expired",
    description: "Case procedure date is outside approved 278 authorization window or authorization is pending.",
    action: "financial",
  },
};

export function GateBlockerAlert({
  reasons,
  onOpenConsent,
  onOpenPreop,
  onOpenHpUpdate,
  onOpenHpOverride,
  onOpenFinancial,
  className,
}: GateBlockerAlertProps) {
  if (reasons.length === 0) return null;

  const hasConsentBlocker = reasons.some(
    (r) => r === "GATE1_CONSENT" || /consent/i.test(r),
  );
  const hasHpBlocker = reasons.some(
    (r) => r === "GATE1_HP" || /hp/i.test(r),
  );
  const hasPreopBlocker = reasons.some(
    (r) => /prep|npo|vitals|iv/i.test(r) || (r === "GATE1_HP" && !onOpenHpUpdate && !onOpenHpOverride),
  );
  const hasFinancialBlocker = reasons.some(
    (r) => /financial|coverage|authorization|auth|gate0/i.test(r),
  );

  return (
    <div
      className={cn(
        "rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm space-y-3",
        className,
      )}
      data-testid="gate-blocker-alert"
      role="alert"
    >
      <div className="flex items-center gap-2 text-destructive font-semibold">
        <ShieldAlert className="size-5 shrink-0" aria-hidden />
        <span>Hard Gate 1 Transition Blocked</span>
      </div>

      <p className="text-xs text-muted-foreground">
        The case cannot transition from <strong>Arrived</strong> to <strong>Pre-Op</strong> until all hard readiness gates are satisfied.
      </p>

      <div className="space-y-2">
        {reasons.map((reason, idx) => {
          const mapped = REASON_MAPPING[reason];
          return (
            <div
              key={`${reason}-${idx}`}
              className="flex items-start gap-2.5 rounded-md border border-destructive/20 bg-background/80 p-2.5 text-xs"
              data-testid={`gate-blocker-reason-${reason}`}
            >
              <XCircle className="size-4 shrink-0 text-destructive mt-0.5" aria-hidden />
              <div className="space-y-0.5">
                <p className="font-medium text-foreground">{mapped?.title ?? reason}</p>
                <p className="text-muted-foreground">{mapped?.description ?? reason}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Policy notice */}
      <div className="flex items-center gap-2 rounded bg-muted/60 p-2 text-[11px] text-muted-foreground">
        <AlertTriangle className="size-3.5 shrink-0 text-warning" aria-hidden />
        <span>
          Policy AC-D-12-4 &amp; AC-F-02-3: Consent and Identity checks have a strict zero-waiver policy. H&amp;P check can only be waived by an Attending Physician or Medical Director with clinical justification.
        </span>
      </div>

      {/* Resolution Quick Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        {hasConsentBlocker && onOpenConsent && (
          <Button
            size="sm"
            onClick={onOpenConsent}
            className="min-h-11 flex items-center gap-1.5"
            data-testid="gate-resolve-consent-button"
          >
            <FileSignature className="size-4" aria-hidden />
            Sign Informed Consent
          </Button>
        )}
        {hasHpBlocker && onOpenHpUpdate && (
          <Button
            size="sm"
            onClick={onOpenHpUpdate}
            className="min-h-11 flex items-center gap-1.5"
            data-testid="gate-resolve-hp-update-button"
          >
            <FileSignature className="size-4" aria-hidden />
            Sign Day-of Update Note
          </Button>
        )}
        {hasHpBlocker && onOpenHpOverride && (
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenHpOverride}
            className="min-h-11 flex items-center gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
            data-testid="gate-resolve-hp-override-button"
          >
            <ShieldAlert className="size-4" aria-hidden />
            Physician Override
          </Button>
        )}
        {hasPreopBlocker && onOpenPreop && (
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenPreop}
            className="min-h-11 flex items-center gap-1.5"
            data-testid="gate-resolve-preop-button"
          >
            <HeartPulse className="size-4" aria-hidden />
            Open Pre-Op Bay
          </Button>
        )}
        {hasFinancialBlocker && onOpenFinancial && (
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenFinancial}
            className="min-h-11 flex items-center gap-1.5"
            data-testid="gate-resolve-financial-button"
          >
            <ShieldCheck className="size-4" aria-hidden />
            Review Financial Clearance
          </Button>
        )}
      </div>
    </div>
  );
}
