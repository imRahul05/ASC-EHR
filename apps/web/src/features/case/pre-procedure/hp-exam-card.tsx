"use client";

import { useState } from "react";
import { Controller } from "react-hook-form";
import { ApiError } from "@asc/api-client";
import { useSaveHp } from "@asc/api-client/react";
import { medHoldCheck } from "@asc/clinical-rules";
import { formatDateTime } from "@asc/clinical-rules/time";
import type { CaseDetail } from "@asc/types";
import {
  AiBadge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  SectionCard,
  SegmentedControl,
  Textarea,
  toast,
} from "@asc/ui";
import { CircleAlert, FileSignature, LoaderCircle, Save, ShieldCheck } from "@asc/ui/icons";
import { ASA_OPTIONS, HP_TEXT_FIELDS, MALLAMPATI_OPTIONS } from "./hp-config";
import type { useHpForm } from "./use-hp-form";

interface HpExamCardProps {
  readonly detail: CaseDetail;
  readonly form: ReturnType<typeof useHpForm>;
  /** Pre-visit brief summary — marks the interval history as containing AI text. */
  readonly briefSummary: string | null;
}

/** History, exam, ASA / Mallampati and airway — save as draft or sign (explicit confirm naming the patient). */
export function HpExamCard({ detail, form, briefSummary }: HpExamCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const save = useSaveHp(detail.case.id);
  const { control, register, getValues, watch } = form;
  const hp = detail.hp;
  const signed = hp?.status === "signed";
  const asa = watch("asa");
  const history = watch("intervalHistory");
  const holds = medHoldCheck(detail.patient.medications);

  const blockers = [
    ...(asa === null ? ["Record the ASA class."] : []),
    ...(hp?.holdsReviewed ? [] : ["Complete the medication review (Medications & holds)."]),
    ...(holds.ok ? [] : [holds.reasons[0]?.message ?? "Confirm medication holds."]),
  ];

  const submit = (sign: boolean) =>
    save.mutate(
      { ...getValues(), ...(sign ? { sign: true } : {}) },
      {
        onSuccess: () => toast.success(sign ? "H&P signed" : "H&P saved as draft"),
        onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not save the H&P"),
        onSettled: () => setConfirmOpen(false),
      },
    );

  return (
    <SectionCard
      title="History & physical"
      description={
        signed && hp?.signedAt
          ? `Signed ${formatDateTime(hp.signedAt)}${hp.performedBy ? ` by ${hp.performedBy.name}` : ""}`
          : "Draft — sign once the exam, ASA and medication review are complete."
      }
      actions={
        signed ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
            <ShieldCheck aria-hidden className="size-3" /> Signed
          </span>
        ) : undefined
      }
      data-testid="hp-exam"
      footer={
        signed ? undefined : (
          <>
            {blockers.length > 0 && (
              <ul className="mr-auto space-y-0.5 text-xs text-muted-foreground" aria-label="Before signing" data-testid="hp-sign-blockers">
                {blockers.map((blocker) => (
                  <li key={blocker} className="flex items-center gap-1.5">
                    <CircleAlert aria-hidden className="size-3.5 text-warning" /> {blocker}
                  </li>
                ))}
              </ul>
            )}
            <Button variant="outline" className="min-h-11" disabled={save.isPending} onClick={() => submit(false)} data-testid="hp-save">
              <Save aria-hidden /> Save draft
            </Button>
            <Button
              className="min-h-11"
              disabled={blockers.length > 0 || save.isPending}
              onClick={() => setConfirmOpen(true)}
              data-testid="hp-sign"
            >
              <FileSignature aria-hidden /> Sign H&P
            </Button>
          </>
        )
      }
    >
      <fieldset disabled={signed || save.isPending} className="space-y-5">
        <legend className="sr-only">H&P fields</legend>
        {HP_TEXT_FIELDS.map((field) => (
          <FormField
            key={field.name}
            id={`hp-${field.name}`}
            label={field.label}
            labelAction={
              field.name === "intervalHistory" && briefSummary && history.includes(briefSummary) ? <AiBadge label="Includes AI brief" /> : undefined
            }
          >
            <Textarea id={`hp-${field.name}`} rows={field.rows} placeholder={field.placeholder} {...register(field.name)} />
          </FormField>
        ))}

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-xs font-medium">ASA physical status</p>
            <Controller
              control={control}
              name="asa"
              render={({ field }) => (
                <SegmentedControl
                  aria-label="ASA physical status"
                  options={ASA_OPTIONS}
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={signed}
                  data-testid="hp-asa"
                />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium">Mallampati class</p>
            <Controller
              control={control}
              name="mallampati"
              render={({ field }) => (
                <SegmentedControl
                  aria-label="Mallampati class"
                  options={MALLAMPATI_OPTIONS}
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={signed}
                  data-testid="hp-mallampati"
                />
              )}
            />
          </div>
        </div>

        <FormField id="hp-airwayNotes" label="Airway notes">
          <Textarea id="hp-airwayNotes" rows={2} placeholder="Dentition, mouth opening, neck extension, OSA / CPAP" {...register("airwayNotes")} />
        </FormField>
      </fieldset>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign H&P?</DialogTitle>
            <DialogDescription>
              Sign the history & physical for <strong>{detail.case.patient.displayName}</strong> · {detail.case.caseNumber}. The signed H&P
              is locked; changes after signing need an addendum.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" className="min-h-11" />}>Keep editing</DialogClose>
            <Button className="min-h-11" disabled={save.isPending} onClick={() => submit(true)} data-testid="hp-sign-confirm">
              {save.isPending ? <LoaderCircle className="animate-spin" /> : <FileSignature aria-hidden />}
              Sign H&P
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
