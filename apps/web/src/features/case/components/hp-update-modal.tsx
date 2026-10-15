"use client";

import { useState } from "react";
import { ApiError } from "@asc/api-client";
import { useSubmitHpUpdateMutation } from "@asc/api-client/react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  Textarea,
  toast,
} from "@asc/ui";
import { FileSignature, LoaderCircle, ShieldCheck } from "@asc/ui/icons";

interface HpUpdateModalProps {
  readonly caseId: string;
  readonly facilityId?: string;
  readonly patientName?: string;
  readonly hpDate?: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

interface HpUpdateFormState {
  readonly attestation: string;
  readonly noIntervalChange: boolean;
  readonly cardiovascularStatus: string;
  readonly pulmonaryStatus: string;
  readonly airwayStatus: string;
  readonly practitionerName: string;
  readonly localError: string | null;
}

const DEFAULT_ATTESTATION =
  "I have evaluated the patient on the day of surgery. I confirm there has been no interval change in cardiovascular, pulmonary, airway, or active medical conditions since the prior H&P. The patient is cleared for planned GI endoscopy under sedation.";

export function HpUpdateModal({
  caseId,
  facilityId = "main",
  patientName = "Patient",
  hpDate,
  open,
  onOpenChange,
  onSuccess,
}: HpUpdateModalProps) {
  const [form, setForm] = useState<HpUpdateFormState>({
    attestation: DEFAULT_ATTESTATION,
    noIntervalChange: false,
    cardiovascularStatus: "Regular rate and rhythm, no murmurs",
    pulmonaryStatus: "Clear to auscultation bilaterally, unlabored",
    airwayStatus: "Mallampati II, normal cervical mobility",
    practitionerName: "",
    localError: null,
  });

  const updateMutation = useSubmitHpUpdateMutation(caseId, facilityId);

  const resetState = () => {
    setForm({
      attestation: DEFAULT_ATTESTATION,
      noIntervalChange: false,
      cardiovascularStatus: "Regular rate and rhythm, no murmurs",
      pulmonaryStatus: "Clear to auscultation bilaterally, unlabored",
      airwayStatus: "Mallampati II, normal cervical mobility",
      practitionerName: "",
      localError: null,
    });
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetState();
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async () => {
    setForm((prev) => ({ ...prev, localError: null }));

    if (!form.noIntervalChange) {
      setForm((prev) => ({
        ...prev,
        localError: "Physician must confirm no interval change in cardiopulmonary status.",
      }));
      return;
    }

    if (!form.cardiovascularStatus.trim()) {
      setForm((prev) => ({ ...prev, localError: "Cardiovascular status is required." }));
      return;
    }

    if (!form.pulmonaryStatus.trim()) {
      setForm((prev) => ({ ...prev, localError: "Pulmonary status is required." }));
      return;
    }

    if (form.attestation.trim().length < 10) {
      setForm((prev) => ({ ...prev, localError: "Attestation statement must be at least 10 characters." }));
      return;
    }

    try {
      await updateMutation.mutateAsync({
        caseId,
        facilityId,
        attestation: form.attestation.trim(),
        noIntervalChange: true,
        cardiovascularStatus: form.cardiovascularStatus.trim(),
        pulmonaryStatus: form.pulmonaryStatus.trim(),
        airwayStatus: form.airwayStatus.trim() || undefined,
        practitionerName: form.practitionerName.trim() || undefined,
      });

      toast.success("Day-of H&P interval update note signed successfully");
      onSuccess?.();
      handleClose(false);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to record day-of H&P update note";
      setForm((prev) => ({ ...prev, localError: message }));
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" data-testid="hp-update-modal">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary font-semibold">
            <FileSignature className="size-5 shrink-0" aria-hidden />
            <DialogTitle>Day-of Pre-Procedure H&P Interval Update Note</DialogTitle>
          </div>
          <DialogDescription>
            CMS 42 CFR § 416.52 requires an attending physician day-of interval update note for any H&P documented prior to the day of surgery.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          {/* Patient and context badge */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
            <p className="font-medium text-foreground">Patient: {patientName}</p>
            {hpDate && (
              <p className="text-xs text-muted-foreground">Original H&amp;P Documented: {hpDate}</p>
            )}
          </div>

          {form.localError && (
            <div
              className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive font-medium"
              role="alert"
            >
              {form.localError}
            </div>
          )}

          {/* Cardiovascular Status */}
          <FormField
            id="hp-cardio"
            label={
              <span>
                Cardiovascular Status <span className="text-destructive">*</span>
              </span>
            }
          >
            <Input
              id="hp-cardio"
              value={form.cardiovascularStatus}
              onChange={(e) => setForm((prev) => ({ ...prev, cardiovascularStatus: e.target.value }))}
              placeholder="e.g. Regular rate and rhythm, no murmurs"
              className="min-h-11"
              data-testid="hp-cardio-input"
            />
          </FormField>

          {/* Pulmonary Status */}
          <FormField
            id="hp-pulmonary"
            label={
              <span>
                Pulmonary Status <span className="text-destructive">*</span>
              </span>
            }
          >
            <Input
              id="hp-pulmonary"
              value={form.pulmonaryStatus}
              onChange={(e) => setForm((prev) => ({ ...prev, pulmonaryStatus: e.target.value }))}
              placeholder="e.g. Clear to auscultation bilaterally"
              className="min-h-11"
              data-testid="hp-pulmonary-input"
            />
          </FormField>

          {/* Airway Status */}
          <FormField id="hp-airway" label="Airway & Cervical Mobility">
            <Input
              id="hp-airway"
              value={form.airwayStatus}
              onChange={(e) => setForm((prev) => ({ ...prev, airwayStatus: e.target.value }))}
              placeholder="e.g. Mallampati II, normal neck extension"
              className="min-h-11"
              data-testid="hp-airway-input"
            />
          </FormField>

          {/* Attending Physician Name */}
          <FormField id="hp-practitioner" label="Attending Physician Signature Name">
            <Input
              id="hp-practitioner"
              value={form.practitionerName}
              onChange={(e) => setForm((prev) => ({ ...prev, practitionerName: e.target.value }))}
              placeholder="e.g. Dr. Jane Corwin, MD"
              className="min-h-11"
              data-testid="hp-practitioner-input"
            />
          </FormField>

          {/* Attestation Text */}
          <FormField id="hp-attestation" label="Clinical Attestation Statement">
            <Textarea
              id="hp-attestation"
              rows={3}
              value={form.attestation}
              onChange={(e) => setForm((prev) => ({ ...prev, attestation: e.target.value }))}
              className="resize-none text-xs"
              data-testid="hp-attestation-textarea"
            />
          </FormField>

          {/* Day-of interval confirmation checkbox */}
          <label className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3.5 cursor-pointer min-h-11">
            <Checkbox
              checked={form.noIntervalChange}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, noIntervalChange: checked === true }))}
              className="mt-0.5 size-5 shrink-0"
              data-testid="hp-no-interval-change-checkbox"
            />
            <div className="space-y-0.5 text-xs">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-primary shrink-0" aria-hidden />
                I attest no interval change in cardiopulmonary or airway status
              </span>
              <p className="text-muted-foreground">
                Patient has been re-examined today and is cleared for endoscopy under conscious sedation/MAC.
              </p>
            </div>
          </label>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <DialogClose render={<Button variant="outline" className="min-h-11 px-4">Cancel</Button>}>
            Cancel
          </DialogClose>
          <Button
            onClick={() => void handleSubmit()}
            disabled={updateMutation.isPending || !form.noIntervalChange}
            className="min-h-11 px-4 flex items-center gap-1.5"
            data-testid="hp-update-submit-button"
          >
            {updateMutation.isPending ? (
              <LoaderCircle className="animate-spin size-4" aria-hidden />
            ) : (
              <FileSignature className="size-4" aria-hidden />
            )}
            Sign Day-of Update Note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
