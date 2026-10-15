"use client";

import { useState } from "react";
import { ApiError } from "@asc/api-client";
import { useSubmitHpOverrideMutation } from "@asc/api-client/react";
import type { HpOverrideRole } from "@asc/validation/hp";
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
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from "@asc/ui";
import { AlertTriangle, LoaderCircle, ShieldAlert } from "@asc/ui/icons";

interface HpOverrideModalProps {
  readonly caseId: string;
  readonly facilityId?: string;
  readonly patientName?: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

interface HpOverrideFormState {
  readonly role: HpOverrideRole;
  readonly overrideReason: string;
  readonly practitionerName: string;
  readonly localError: string | null;
}

export function HpOverrideModal({
  caseId,
  facilityId = "main",
  patientName = "Patient",
  open,
  onOpenChange,
  onSuccess,
}: HpOverrideModalProps) {
  const [form, setForm] = useState<HpOverrideFormState>({
    role: "attending-physician",
    overrideReason: "",
    practitionerName: "",
    localError: null,
  });

  const overrideMutation = useSubmitHpOverrideMutation(caseId, facilityId);

  const resetState = () => {
    setForm({
      role: "attending-physician",
      overrideReason: "",
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

    const trimmedReason = form.overrideReason.trim();
    if (trimmedReason.length < 10) {
      setForm((prev) => ({
        ...prev,
        localError: "Clinical override justification must be at least 10 characters.",
      }));
      return;
    }

    try {
      await overrideMutation.mutateAsync({
        caseId,
        facilityId,
        overrideReason: trimmedReason,
        role: form.role,
        practitionerName: form.practitionerName.trim() || undefined,
      });

      toast.success("H&P Gate 1 check clinically waived by physician override");
      onSuccess?.();
      handleClose(false);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to record clinical override";
      setForm((prev) => ({ ...prev, localError: message }));
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="hp-override-modal">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive font-semibold">
            <ShieldAlert className="size-5 shrink-0" aria-hidden />
            <DialogTitle>Clinical Override of Pre-Procedure H&amp;P</DialogTitle>
          </div>
          <DialogDescription>
            CMS 42 CFR § 416.52 requires an H&amp;P within 30 days. Only an Attending Physician or Medical Director may waive this check.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          {/* Warning banner */}
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 space-y-1.5 text-xs text-destructive">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              <span>Role-Restricted Clinical Override</span>
            </div>
            <p className="text-muted-foreground">
              Patient: <strong>{patientName}</strong>. This clinical waiver will be permanently logged with your credentials in the medical record. Front desk and nursing personnel are prohibited from waiving this check.
            </p>
          </div>

          {form.localError && (
            <div
              className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive font-medium"
              role="alert"
            >
              {form.localError}
            </div>
          )}

          {/* Physician Role Selection */}
          <div className="space-y-1.5">
            <Label htmlFor="hp-override-role" className="font-medium">
              Physician Role Authorization <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.role}
              onValueChange={(val) => setForm((prev) => ({ ...prev, role: val as HpOverrideRole }))}
            >
              <SelectTrigger id="hp-override-role" className="min-h-11" data-testid="hp-override-role-select">
                <SelectValue placeholder="Select authorized physician role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="attending-physician">Attending Physician</SelectItem>
                <SelectItem value="medical-director">Medical Director</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Physician Name */}
          <FormField id="hp-override-physician-name" label="Overriding Physician Name">
            <Input
              id="hp-override-physician-name"
              value={form.practitionerName}
              onChange={(e) => setForm((prev) => ({ ...prev, practitionerName: e.target.value }))}
              placeholder="e.g. Dr. Robert Chase, MD"
              className="min-h-11"
              data-testid="hp-override-physician-input"
            />
          </FormField>

          {/* Clinical Justification */}
          <FormField
            id="hp-override-reason"
            label={
              <span>
                Clinical Override Justification <span className="text-destructive">*</span>
              </span>
            }
          >
            <Textarea
              id="hp-override-reason"
              rows={4}
              value={form.overrideReason}
              onChange={(e) => setForm((prev) => ({ ...prev, overrideReason: e.target.value }))}
              placeholder="Detail medical rationale for proceeding without standard H&P (minimum 10 characters)..."
              className="resize-none text-xs"
              data-testid="hp-override-reason-textarea"
            />
            <p className="text-[11px] text-muted-foreground">
              Minimum 10 characters. Must describe direct clinical evaluation and risk-benefit justification.
            </p>
          </FormField>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <DialogClose render={<Button variant="outline" className="min-h-11 px-4">Cancel</Button>}>
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => void handleSubmit()}
            disabled={overrideMutation.isPending || form.overrideReason.trim().length < 10}
            className="min-h-11 px-4 flex items-center gap-1.5"
            data-testid="hp-override-submit-button"
          >
            {overrideMutation.isPending ? (
              <LoaderCircle className="animate-spin size-4" aria-hidden />
            ) : (
              <ShieldAlert className="size-4" aria-hidden />
            )}
            Authorize Clinical Override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
