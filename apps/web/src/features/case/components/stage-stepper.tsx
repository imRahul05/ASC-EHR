"use client";

import { useState } from "react";
import { ApiError } from "@asc/api-client";
import { useTransitionCase } from "@asc/api-client/react";
import { FORWARD_STAGE_ORDER, PHASE_LABEL } from "@asc/clinical-rules";
import type { CaseDetail, CasePhase, CaseStage } from "@asc/types";
import { ArrowRight, CheckIcon, LoaderCircle } from "@asc/ui/icons";
import { Button, cn, SectionCard, toast } from "@asc/ui";
import { GateBlockerAlert } from "./gate-blocker-alert";

interface StageStepperProps {
  readonly detail: CaseDetail;
  readonly onOpenConsent?: () => void;
  readonly onOpenPreop?: () => void;
}

export function StageStepper({ detail, onOpenConsent, onOpenPreop }: StageStepperProps) {
  const [gateBlockers, setGateBlockers] = useState<readonly string[]>([]);
  const transition = useTransitionCase(detail.case.id);

  const currentPhase = detail.case.phase;
  const currentStage = detail.case.stage ?? (currentPhase.toLowerCase() as CaseStage);

  const stages = FORWARD_STAGE_ORDER;
  const currentIndex = stages.indexOf(currentStage);

  const nextStage = currentIndex >= 0 && currentIndex < stages.length - 1 ? stages[currentIndex + 1] : null;

  const handleAdvance = async (targetStage: CaseStage) => {
    setGateBlockers([]);

    // Translate stage to phase if needed
    const targetPhase = targetStage.toUpperCase() as CasePhase;

    try {
      const updated = await transition.mutateAsync({ to: targetPhase });
      toast.success(`${updated.case.caseNumber} advanced to ${targetStage}`);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 409 || err.code === "GATE_FAILED")) {
        const extractedReasons: string[] = [];
        if (err.reasons) {
          for (const r of err.reasons) {
            extractedReasons.push(r.code);
          }
        } else if (err.details && typeof err.details === "object") {
          for (const [k, v] of Object.entries(err.details)) {
            extractedReasons.push(typeof v === "string" ? `${k}: ${v}` : k);
          }
        }

        if (extractedReasons.length === 0) {
          extractedReasons.push("GATE1_CONSENT");
        }

        setGateBlockers(extractedReasons);
        toast.error("Hard Gate 1 check failed: readiness requirements not satisfied");
      } else {
        const message = err instanceof ApiError ? err.message : "Failed to advance stage";
        toast.error(message);
      }
    }
  };

  return (
    <SectionCard contentClassName="p-4 space-y-4" data-testid="stage-stepper-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Clinical Stage Flow</h3>
        {nextStage && (
          <Button
            size="sm"
            onClick={() => void handleAdvance(nextStage)}
            disabled={transition.isPending}
            className="min-h-11 flex items-center gap-1.5"
            data-testid="advance-stage-button"
          >
            {transition.isPending ? (
              <LoaderCircle className="animate-spin size-4" aria-hidden />
            ) : (
              <ArrowRight className="size-4" aria-hidden />
            )}
            Advance to {PHASE_LABEL[nextStage.toUpperCase() as CasePhase] ?? nextStage}
          </Button>
        )}
      </div>

      <ol
        data-testid="stage-stepper-list"
        aria-label="Clinical stage"
        className="flex w-full items-start overflow-x-auto pb-1"
      >
        {stages.map((step, idx) => {
          const done = idx < currentIndex;
          const active = idx === currentIndex;
          return (
            <li
              key={step}
              aria-current={active ? "step" : undefined}
              className="group/step relative flex min-w-16 flex-1 flex-col items-center gap-1.5"
            >
              {idx > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-2 right-1/2 h-px w-full -translate-y-1/2",
                    done || active ? "bg-primary/50" : "bg-border",
                  )}
                />
              )}
              <span
                className={cn(
                  "relative z-10 flex size-5 items-center justify-center rounded-full border text-[10px] transition-colors",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-transparent ring-4 ring-primary/20 bg-primary text-primary-foreground font-semibold",
                  !done && !active && "border-border bg-background text-muted-foreground",
                )}
              >
                {done ? <CheckIcon aria-hidden className="size-3" strokeWidth={3} /> : idx + 1}
              </span>
              <span
                className={cn(
                  "text-center text-[10px] leading-tight max-w-16",
                  active ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {PHASE_LABEL[step.toUpperCase() as CasePhase] ?? step}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Structured Gate Blocker Alert */}
      {gateBlockers.length > 0 && (
        <GateBlockerAlert
          reasons={gateBlockers}
          onOpenConsent={onOpenConsent}
          onOpenPreop={onOpenPreop}
        />
      )}
    </SectionCard>
  );
}
