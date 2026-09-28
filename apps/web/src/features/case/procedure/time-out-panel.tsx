"use client";

import { useState } from "react";
import { useAttestTimeOut, useTransitionCase } from "@asc/api-client/react";
import {
  formatTime24,
  TIME_OUT_ITEM_LABEL,
  TIME_OUT_ROLE_LABEL,
  TIME_OUT_ROLES,
  timeOutGate,
} from "@asc/clinical-rules";
import type { CaseDetail, StaffRef, TimeOutChecklist, TimeOutRole } from "@asc/types";
import { Button, GateChecklist, SectionCard, TapTile, toast } from "@asc/ui";
import { ArrowRight, BadgeCheck, LoaderCircle, ShieldCheck } from "@asc/ui/icons";
import { notifyError } from "../notify-error";

interface TimeOutPanelProps {
  readonly detail: CaseDetail;
}

const ITEMS = Object.keys(TIME_OUT_ITEM_LABEL) as (keyof TimeOutChecklist)[];

const ROLE_SHORT: Readonly<Record<TimeOutRole, string>> = { SURGEON: "MD", NURSE: "RN", ANESTHESIOLOGIST: "CRNA" };

function teamMember(detail: CaseDetail, role: TimeOutRole): StaffRef {
  const byRole: Readonly<Record<TimeOutRole, StaffRef>> = {
    SURGEON: detail.case.team.surgeon,
    NURSE: detail.case.team.nurse,
    ANESTHESIOLOGIST: detail.case.team.anesthesia,
  };
  return byRole[role];
}

/** The fact the team reads aloud for each item, so the tile is a real check, not a blind tap. */
function itemFact(detail: CaseDetail, item: keyof TimeOutChecklist): string {
  const { patient, case: procedureCase, consents } = detail;
  const holds = patient.medications.filter((med) => med.holdRule !== null);
  const facts: Readonly<Record<keyof TimeOutChecklist, string>> = {
    patientIdentity: `${procedureCase.patient.displayName} · DOB ${procedureCase.patient.dateOfBirth} · MRN ${procedureCase.patient.mrn}`,
    procedureConfirmed: `${procedureCase.procedureLabel} · ${procedureCase.indication}`,
    consentVerified: `${consents.filter((consent) => consent.status === "signed").length}/${consents.length} consents signed`,
    allergiesReviewed:
      patient.allergies.length === 0 ? "No known allergies" : patient.allergies.map((allergy) => allergy.substance).join(", "),
    anticoagulationReviewed:
      holds.length === 0 ? "No holds required" : holds.map((med) => `${med.name} (${med.holdStatus.replaceAll("_", " ")})`).join(", "),
    equipmentReady: "Scope, suction, CO₂ insufflation, snares",
  };
  return facts[item];
}

/**
 * Multi-role time-out (room mode): the team confirms each checklist item aloud, then the surgeon,
 * nurse and anesthesia provider each attest. All three → "Start procedure" (timeOutGate, re-checked by the API).
 */
export function TimeOutPanel({ detail }: TimeOutPanelProps) {
  const [checklist, setChecklist] = useState<TimeOutChecklist>(detail.timeOut.checklist);
  const attest = useAttestTimeOut(detail.case.id);
  const transition = useTransitionCase(detail.case.id);
  const gate = timeOutGate(detail.timeOut);
  const checklistDone = ITEMS.every((item) => checklist[item]);
  const pendingRole = attest.isPending ? attest.variables.role : null;

  const attestAs = (role: TimeOutRole) =>
    attest.mutate(
      { role, checklist },
      {
        onSuccess: () => toast.success(`Time-out attested by ${TIME_OUT_ROLE_LABEL[role].toLowerCase()}`),
        onError: notifyError("Could not record the attestation"),
      },
    );

  const start = () =>
    transition.mutate(
      { to: "IN_PROCEDURE" },
      { onSuccess: () => toast.success("Procedure started"), onError: notifyError("Could not start the procedure") },
    );

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2 text-base">
          <ShieldCheck aria-hidden className="size-5 text-primary" /> Time-out
        </span>
      }
      description="Read each item aloud. Every role attests before the scope goes in."
      data-testid="procedure-timeout"
    >
      <div className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="sr-only">Time-out checklist</legend>
          <div className="grid gap-2 @xl:grid-cols-2">
            {ITEMS.map((item) => (
              <TapTile
                key={item}
                label={TIME_OUT_ITEM_LABEL[item]}
                detail={itemFact(detail, item)}
                done={checklist[item]}
                onClick={() => setChecklist((current) => ({ ...current, [item]: !current[item] }))}
                data-testid={`procedure-timeout-item-${item}`}
              />
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3 @xl:grid-cols-3">
          {TIME_OUT_ROLES.map((role) => {
            const attestation = detail.timeOut.attestations.find((item) => item.role === role);
            return (
              <div key={role} className="flex flex-col gap-3 rounded-xl border-2 border-border p-4" data-testid={`procedure-timeout-role-${role.toLowerCase()}`}>
                <div>
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {ROLE_SHORT[role]} · {TIME_OUT_ROLE_LABEL[role]}
                  </p>
                  <p className="text-base font-semibold">{teamMember(detail, role).name}</p>
                </div>
                {attestation ? (
                  <p className="flex items-center gap-2 text-sm font-medium text-success">
                    <BadgeCheck aria-hidden className="size-5" />
                    Attested {formatTime24(attestation.at)} · {attestation.by.initials}
                  </p>
                ) : (
                  <Button
                    size="lg"
                    className="h-12 text-base"
                    disabled={!checklistDone || attest.isPending}
                    onClick={() => attestAs(role)}
                    data-testid={`procedure-timeout-attest-${role.toLowerCase()}`}
                  >
                    {pendingRole === role && <LoaderCircle className="animate-spin" />}
                    Attest as {ROLE_SHORT[role]}
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {!checklistDone && <p className="text-sm text-muted-foreground">Confirm every item to enable attestation.</p>}

        <div className="flex flex-col gap-3 border-t border-border pt-4 @xl:flex-row @xl:items-end @xl:justify-between">
          <GateChecklist result={gate} title="Time-out gate" />
          <Button
            size="lg"
            className="h-14 px-6 text-base"
            disabled={!gate.ok || transition.isPending}
            onClick={start}
            data-testid="procedure-start-button"
          >
            {transition.isPending && <LoaderCircle className="animate-spin" />}
            Start procedure
            <ArrowRight />
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
