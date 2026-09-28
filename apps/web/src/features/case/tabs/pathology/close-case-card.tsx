"use client";

import { useState } from "react";
import { ApiError } from "@asc/api-client";
import { useTransitionCase } from "@asc/api-client/react";
import { transitionGate } from "@asc/clinical-rules";
import type { CaseDetail } from "@asc/types";
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
import { Archive, LoaderCircle } from "@asc/ui/icons";

interface CloseCaseCardProps {
  readonly detail: CaseDetail;
}

/** EXPORTED → CLOSED once all specimens resulted, surveillance set and a letter sent (same gate as the side panel). */
export function CloseCaseCard({ detail }: CloseCaseCardProps) {
  const [confirming, setConfirming] = useState(false);
  const transition = useTransitionCase(detail.case.id);
  const gate = transitionGate(detail, "CLOSED");
  const name = detail.case.patient.displayName;

  const onClose = () =>
    transition.mutate(
      { to: "CLOSED" },
      {
        onSuccess: () => toast.success(`${detail.case.caseNumber} closed`),
        onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not close the case"),
        onSettled: () => setConfirming(false),
      },
    );

  return (
    <SectionCard title="Close case" description="Episode is complete when results, surveillance and letters are done." data-testid="pathology-close">
      <div className="space-y-4">
        <GateChecklist result={gate} />
        <Button className="w-full" disabled={!gate.ok || transition.isPending} onClick={() => setConfirming(true)} data-testid="pathology-close-button">
          <Archive /> Close case
        </Button>
      </div>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close case for {name}?</DialogTitle>
            <DialogDescription>
              {name} · {detail.case.caseNumber} will move to <strong>Closed</strong>. The chart becomes read-only. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Keep open</DialogClose>
            <Button onClick={onClose} disabled={transition.isPending} data-testid="pathology-close-confirm">
              {transition.isPending ? <LoaderCircle className="animate-spin" /> : <Archive />}
              Close case
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
