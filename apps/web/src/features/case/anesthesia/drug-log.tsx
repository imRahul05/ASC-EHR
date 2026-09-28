"use client";

import { useState } from "react";
import { useAddAnesthesiaEntry } from "@asc/api-client/react";
import { ANESTHESIA_DRUG_LABEL, formatTime24 } from "@asc/clinical-rules";
import type { AnesthesiaDrug, AnesthesiaRecord } from "@asc/types";
import { Button, EmptyState, Input, OptionSelect, SectionCard, toast } from "@asc/ui";
import { Pill, Plus } from "@asc/ui/icons";
import { notifyError } from "../notify-error";
import { DRUG_PRESETS, DRUGS, roundDose } from "./flowsheet-model";

interface DrugLogProps {
  readonly record: AnesthesiaRecord;
  readonly editable: boolean;
}

const DRUG_OPTIONS = DRUGS.map((value) => ({ value, label: ANESTHESIA_DRUG_LABEL[value] }));
/** Quick-dose buttons shown up front (the rest via the custom dose row). */
const QUICK_DRUGS: readonly AnesthesiaDrug[] = ["propofol", "lidocaine", "fentanyl", "midazolam", "glycopyrrolate", "ondansetron"];
const MAX_AMOUNT = 1_000;

interface CustomDose {
  readonly drug: AnesthesiaDrug;
  readonly amount: string;
}

/** Drug administration: one-tap common doses, custom dose, running totals per drug and the timed log. */
export function DrugLog({ record, editable }: DrugLogProps) {
  const [custom, setCustom] = useState<CustomDose>({ drug: "propofol", amount: "" });
  const add = useAddAnesthesiaEntry(record.caseId);
  const totals = DRUGS.map((drug) => ({
    drug,
    total: roundDose(record.doses.filter((dose) => dose.drug === drug).reduce((sum, dose) => sum + dose.amount, 0)),
  })).filter((item) => item.total > 0);
  const amount = Number(custom.amount);
  const amountValid = custom.amount !== "" && Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT;

  const give = (drug: AnesthesiaDrug, value: number, reset = false) =>
    add.mutate(
      { kind: "dose", drug, amount: value, unit: DRUG_PRESETS[drug].unit },
      {
        onSuccess: () => {
          toast.success(`${ANESTHESIA_DRUG_LABEL[drug]} ${value} ${DRUG_PRESETS[drug].unit} IV recorded`);
          if (reset) setCustom((current) => ({ ...current, amount: "" }));
        },
        onError: notifyError("Could not record the dose"),
      },
    );

  return (
    <SectionCard title="Drug administration" description="All doses IV. Totals update as you record." data-testid="anesthesia-drugs">
      <div className="space-y-4">
        {editable && (
          <>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Quick doses">
              {QUICK_DRUGS.flatMap((drug) =>
                DRUG_PRESETS[drug].quick.map((value) => (
                  <Button
                    key={`${drug}-${value}`}
                    variant="outline"
                    className="h-11 px-3 tabular-nums"
                    disabled={add.isPending}
                    onClick={() => give(drug, value)}
                    data-testid={`anesthesia-dose-${drug}-${value}`}
                  >
                    {ANESTHESIA_DRUG_LABEL[drug]} {value} {DRUG_PRESETS[drug].unit}
                  </Button>
                )),
              )}
            </div>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (amountValid) give(custom.drug, amount, true);
              }}
              aria-label="Custom dose"
            >
              <div className="w-48 space-y-1">
                <label htmlFor="dose-drug" className="text-xs font-medium">
                  Drug
                </label>
                <OptionSelect
                  id="dose-drug"
                  options={DRUG_OPTIONS}
                  value={custom.drug}
                  onValueChange={(drug) => setCustom((current) => ({ ...current, drug }))}
                  className="data-[size=default]:h-11"
                />
              </div>
              <div className="w-32 space-y-1">
                <label htmlFor="dose-amount" className="text-xs font-medium">
                  Amount ({DRUG_PRESETS[custom.drug].unit})
                </label>
                <Input
                  id="dose-amount"
                  inputMode="decimal"
                  value={custom.amount}
                  onChange={(event) => setCustom((current) => ({ ...current, amount: event.target.value }))}
                  className="h-11 text-base tabular-nums"
                  data-testid="anesthesia-dose-amount"
                />
              </div>
              <Button type="submit" className="h-11" disabled={!amountValid || add.isPending} data-testid="anesthesia-dose-add">
                <Plus /> Record dose
              </Button>
            </form>
          </>
        )}

        {totals.length > 0 && (
          <dl className="grid grid-cols-2 gap-2 @md:grid-cols-4" data-testid="anesthesia-drug-totals">
            {totals.map(({ drug, total }) => (
              <div key={drug} className="rounded-lg border border-border px-3 py-2">
                <dt className="text-xs text-muted-foreground">{ANESTHESIA_DRUG_LABEL[drug]} total</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {total} <span className="text-sm font-normal text-muted-foreground">{DRUG_PRESETS[drug].unit}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}

        {record.doses.length === 0 ? (
          <EmptyState icon={Pill} title="No doses recorded" description={editable ? "Tap a quick dose or record a custom amount." : "No drugs were given."} />
        ) : (
          <ol className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm" aria-label="Dose log">
            {[...record.doses].reverse().map((dose) => (
              <li key={dose.id} className="flex items-center gap-3 px-3 py-2">
                <time className="w-12 font-mono text-muted-foreground tabular-nums">{formatTime24(dose.at)}</time>
                <span className="flex-1 font-medium">{ANESTHESIA_DRUG_LABEL[dose.drug]}</span>
                <span className="tabular-nums">
                  {dose.amount} {dose.unit} {dose.route}
                </span>
                <span className="w-8 text-right text-xs text-muted-foreground">{dose.by.initials}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </SectionCard>
  );
}
