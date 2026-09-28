"use client";

import { useState } from "react";
import { ApiError } from "@asc/api-client";
import { useCheckIn } from "@asc/api-client/react";
import { isPhaseAtLeast } from "@asc/clinical-rules";
import { formatTime24 } from "@asc/clinical-rules/time";
import type { CaseDetail } from "@asc/types";
import { Button, Checkbox, SectionCard, toast } from "@asc/ui";
import { CircleCheck, DoorOpen, LoaderCircle } from "@asc/ui/icons";

interface CheckInCardProps {
  readonly detail: CaseDetail;
}

const CHECKS = [
  { key: "escortPresent", label: "Escort is present in the facility" },
  { key: "npoConfirmed", label: "Patient confirms NPO (nothing by mouth per instructions)" },
] as const;

/** Front-of-house check-in (CONFIRMED → ARRIVED). After arrival it collapses to a status line. */
export function CheckInCard({ detail }: CheckInCardProps) {
  const [answers, setAnswers] = useState({ escortPresent: false, npoConfirmed: false });
  const checkIn = useCheckIn(detail.case.id);
  const { phase, timestamps } = detail.case;

  if (isPhaseAtLeast(phase, "ARRIVED")) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-xs" data-testid="preop-checked-in">
        <CircleCheck aria-hidden className="size-4 text-success" />
        Checked in{timestamps.ARRIVED ? ` at ${formatTime24(timestamps.ARRIVED)}` : ""}
        <span className="text-muted-foreground">· Escort {detail.patient.escort?.present ? "present" : "not yet present"}</span>
      </p>
    );
  }

  const confirmed = phase === "CONFIRMED";
  const submit = () =>
    checkIn.mutate(answers, {
      onSuccess: () => toast.success(`${detail.case.caseNumber} checked in`),
      onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not check in"),
    });

  return (
    <SectionCard
      title="Check-in"
      description={confirmed ? "Verify identity (name + date of birth) against the wristband, then check in." : "The case must be confirmed before check-in."}
      data-testid="preop-check-in"
      footer={
        <Button className="min-h-11" disabled={!confirmed || checkIn.isPending} onClick={submit} data-testid="preop-check-in-submit">
          {checkIn.isPending ? <LoaderCircle className="animate-spin" /> : <DoorOpen aria-hidden />}
          Check in
        </Button>
      }
    >
      <div className="space-y-1">
        {CHECKS.map((check) => (
          <label key={check.key} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm" htmlFor={`preop-${check.key}`}>
            <Checkbox
              id={`preop-${check.key}`}
              checked={answers[check.key]}
              disabled={!confirmed}
              onCheckedChange={(value) => setAnswers((current) => ({ ...current, [check.key]: value === true }))}
              data-testid={`preop-check-in-${check.key}`}
            />
            {check.label}
          </label>
        ))}
      </div>
    </SectionCard>
  );
}
