"use client";

import { useState } from "react";
import { ApiError } from "@asc/api-client";
import { useRecordPathologyResult } from "@asc/api-client/react";
import type { Histology, PathologyResult, Specimen } from "@asc/types";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  OptionSelect,
  toast,
} from "@asc/ui";
import { FlaskConical, LoaderCircle } from "@asc/ui/icons";
import { DYSPLASIA_LABEL, HISTOLOGY_LABEL, SIMULATED_RESULTS, siteLabel } from "./pathology-labels";

interface ResultForm {
  readonly histology: Histology;
  readonly dysplasia: PathologyResult["dysplasia"];
  readonly diagnosis: string;
}

const HISTOLOGY_OPTIONS = Object.entries(HISTOLOGY_LABEL).map(([value, label]) => ({ value: value as Histology, label }));
const DYSPLASIA_OPTIONS = Object.entries(DYSPLASIA_LABEL).map(([value, label]) => ({ value: value as PathologyResult["dysplasia"], label }));

function initialForm(specimen: Specimen, index: number): ResultForm {
  const preset = SIMULATED_RESULTS[index % SIMULATED_RESULTS.length] ?? { histology: "hyperplastic", dysplasia: "none" };
  const dysplasia = preset.dysplasia === "none" ? "" : `, ${DYSPLASIA_LABEL[preset.dysplasia].toLowerCase()}`;
  return { ...preset, diagnosis: `${siteLabel(specimen.site)} polyp: ${HISTOLOGY_LABEL[preset.histology].toLowerCase()}${dysplasia}` };
}

interface RecordResultDialogProps {
  readonly caseId: string;
  readonly specimen: Specimen | null;
  /** Position of the specimen (A = 0) — picks the simulated answer. */
  readonly index: number;
  readonly onClose: () => void;
}

/** Mock lab interface: "Simulate result arrival" pre-fills a plausible report the user can adjust before recording. */
export function RecordResultDialog({ caseId, specimen, index, onClose }: RecordResultDialogProps) {
  return (
    <Dialog open={specimen !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>{specimen && <ResultFormBody key={specimen.id} caseId={caseId} specimen={specimen} index={index} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function ResultFormBody({ caseId, specimen, index, onClose }: { readonly caseId: string; readonly specimen: Specimen; readonly index: number; readonly onClose: () => void }) {
  const [form, setForm] = useState<ResultForm>(() => initialForm(specimen, index));
  const record = useRecordPathologyResult(caseId);

  const onSubmit = () =>
    record.mutate(
      { specimenId: specimen.id, ...form },
      {
        onSuccess: () => {
          toast.success(`Result recorded for jar ${specimen.jar}`);
          onClose();
        },
        onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not record the result"),
      },
    );

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>Result for jar {specimen.jar}</DialogTitle>
        <DialogDescription>
          {siteLabel(specimen.site)} · {specimen.description}
          {specimen.sizeMm ? ` · ${specimen.sizeMm} mm` : ""}. Simulated lab report — adjust before recording.
        </DialogDescription>
      </DialogHeader>
      <FormField id="path-histology" label="Histology">
        <OptionSelect id="path-histology" options={HISTOLOGY_OPTIONS} value={form.histology} onValueChange={(histology) => setForm((prev) => ({ ...prev, histology }))} data-testid="pathology-result-histology" />
      </FormField>
      <FormField id="path-dysplasia" label="Dysplasia">
        <OptionSelect id="path-dysplasia" options={DYSPLASIA_OPTIONS} value={form.dysplasia} onValueChange={(dysplasia) => setForm((prev) => ({ ...prev, dysplasia }))} data-testid="pathology-result-dysplasia" />
      </FormField>
      <FormField id="path-diagnosis" label="Diagnosis line">
        <Input id="path-diagnosis" value={form.diagnosis} onChange={(event) => setForm((prev) => ({ ...prev, diagnosis: event.target.value }))} data-testid="pathology-result-diagnosis" />
      </FormField>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button onClick={onSubmit} disabled={record.isPending || form.diagnosis.trim() === ""} data-testid="pathology-result-save">
          {record.isPending ? <LoaderCircle className="animate-spin" /> : <FlaskConical />}
          Record result
        </Button>
      </DialogFooter>
    </div>
  );
}
