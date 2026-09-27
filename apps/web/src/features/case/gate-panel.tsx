"use client";

import { useState } from "react";
import { ApiError } from "@asc/api-client";
import { useTransitionCase } from "@asc/api-client/react";
import {
  ALLOWED_TRANSITIONS,
  nextPhase,
  PHASE_ACTION_LABEL,
  PHASE_LABEL,
  STOPPED_PHASES,
  transitionGate,
} from "@asc/clinical-rules";
import type { CaseDetail, CasePhase } from "@asc/types";
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
  SectionCard,
  toast,
} from "@asc/ui";
import { ArrowRight, LoaderCircle } from "@asc/ui/icons";

/** Transitions that cannot be undone — they need an explicit confirm naming patient + action. */
const CONFIRM_PHASES: readonly CasePhase[] = ["DISCHARGED", "CLOSED", "CANCELLED", "NO_SHOW"];

interface GatePanelProps {
  readonly detail: CaseDetail;
}

/** Current gate (RuleResult reasons) + the primary "advance phase" action. Server re-checks the same rule. */
export function GatePanel({ detail }: GatePanelProps) {
  const [confirmTarget, setConfirmTarget] = useState<CasePhase | null>(null);
  const transition = useTransitionCase(detail.case.id);
  const phase = detail.case.phase;
  const next = nextPhase(phase);
  const gate = next ? transitionGate(detail, next) : null;
  const stops = ALLOWED_TRANSITIONS[phase].filter((target) => STOPPED_PHASES.includes(target));

  const run = (to: CasePhase) =>
    transition.mutate(
      { to },
      {
        onSuccess: (updated) => toast.success(`${updated.case.caseNumber} is now ${PHASE_LABEL[updated.case.phase]}`),
        onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not update the case"),
        onSettled: () => setConfirmTarget(null),
      },
    );

  const request = (to: CasePhase) => (CONFIRM_PHASES.includes(to) ? setConfirmTarget(to) : run(to));

  return (
    <SectionCard
      title={next ? `Next: ${PHASE_LABEL[next]}` : "No further steps"}
      description={next ? "Every item must pass before the case can move on." : `Case is ${PHASE_LABEL[phase].toLowerCase()}.`}
      data-testid="case-gate-panel"
    >
      <div className="space-y-4">
        {gate && <GateChecklist result={gate} />}
        {next && (
          <Button
            className="w-full"
            size="lg"
            disabled={!gate?.ok || transition.isPending}
            onClick={() => request(next)}
            data-testid="case-transition-button"
          >
            {transition.isPending ? <LoaderCircle className="animate-spin" /> : null}
            {PHASE_ACTION_LABEL[next]}
            <ArrowRight />
          </Button>
        )}
        {stops.length > 0 && (
          <div className="flex gap-2">
            {stops.map((target) => (
              <Button
                key={target}
                variant="ghost"
                size="sm"
                className="flex-1 text-muted-foreground"
                disabled={transition.isPending}
                onClick={() => request(target)}
                data-testid={`case-stop-${target.toLowerCase()}`}
              >
                {PHASE_ACTION_LABEL[target]}
              </Button>
            ))}
          </div>
        )}
      </div>

      <Dialog open={confirmTarget !== null} onOpenChange={(open) => (open ? undefined : setConfirmTarget(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmTarget ? PHASE_ACTION_LABEL[confirmTarget] : ""}?</DialogTitle>
            <DialogDescription>
              {detail.case.patient.displayName} · {detail.case.caseNumber} will move to{" "}
              <strong>{confirmTarget ? PHASE_LABEL[confirmTarget] : ""}</strong>. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Keep as is</DialogClose>
            <Button
              variant={confirmTarget === "CANCELLED" || confirmTarget === "NO_SHOW" ? "destructive" : "default"}
              disabled={transition.isPending}
              onClick={() => confirmTarget && run(confirmTarget)}
              data-testid="case-transition-confirm"
            >
              {confirmTarget ? PHASE_ACTION_LABEL[confirmTarget] : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
