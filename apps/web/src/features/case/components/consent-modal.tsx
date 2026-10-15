"use client";

import { useState } from "react";
import { ApiError } from "@asc/api-client";
import { useSignConsent } from "@asc/api-client/react";
import type { SignConsentInput } from "@asc/validation/consent";
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
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SignaturePad,
  toast,
} from "@asc/ui";
import { FileSignature, LoaderCircle, ShieldAlert } from "@asc/ui/icons";

interface ConsentModalProps {
  readonly caseId: string;
  readonly facilityId?: string;
  readonly procedureName: string;
  readonly procedureCode: string;
  readonly performingPhysicianName: string;
  readonly patientName: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

type SignerRelationship = "patient" | "legal_guardian" | "healthcare_proxy";

interface ConsentFormState {
  readonly signerName: string;
  readonly signerRelationship: SignerRelationship;
  readonly risksAcknowledged: boolean;
  readonly signatureDataUrl: string | null;
  readonly localError: string | null;
}

export function ConsentModal({
  caseId,
  facilityId = "main",
  procedureName,
  procedureCode,
  performingPhysicianName,
  patientName,
  open,
  onOpenChange,
  onSuccess,
}: ConsentModalProps) {
  const [form, setForm] = useState<ConsentFormState>({
    signerName: patientName,
    signerRelationship: "patient",
    risksAcknowledged: false,
    signatureDataUrl: null,
    localError: null,
  });

  const signConsentMutation = useSignConsent(caseId, facilityId);

  const resetState = () => {
    setForm({
      signerName: patientName,
      signerRelationship: "patient",
      risksAcknowledged: false,
      signatureDataUrl: null,
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

    const trimmedSigner = form.signerName.trim();
    if (!trimmedSigner) {
      setForm((prev) => ({ ...prev, localError: "Signer name is required" }));
      return;
    }

    if (!form.risksAcknowledged) {
      setForm((prev) => ({ ...prev, localError: "You must acknowledge reviewing risks, benefits, and alternatives" }));
      return;
    }

    if (!form.signatureDataUrl) {
      setForm((prev) => ({ ...prev, localError: "Patient or authorized representative signature is required" }));
      return;
    }

    const payload: SignConsentInput = {
      caseId,
      procedureName,
      procedureCode,
      performingPhysicianName,
      signerName: trimmedSigner,
      signerRelationship: form.signerRelationship,
      signatureDataUrl: form.signatureDataUrl,
      consentFormVersion: "2026.1",
      risksAcknowledged: true,
      facilityId,
    };

    try {
      await signConsentMutation.mutateAsync(payload);
      toast.success("Informed consent recorded and verified");
      handleClose(false);
      onSuccess?.();
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : "Failed to record consent";
      setForm((prev) => ({ ...prev, localError: message }));
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl" data-testid="consent-modal">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <FileSignature className="size-5 text-primary" aria-hidden />
            <DialogTitle>Informed Consent Attestation</DialogTitle>
          </div>
          <DialogDescription>
            Digital informed consent for {procedureName} ({procedureCode}) performed by {performingPhysicianName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Procedure & Physician Notice */}
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-xs text-muted-foreground">Procedure:</span>
                <p className="font-medium text-foreground">{procedureName}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Code:</span>
                <p className="font-mono text-xs font-semibold text-foreground">{procedureCode}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Physician:</span>
                <p className="font-medium text-foreground">{performingPhysicianName}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Patient:</span>
                <p className="font-medium text-foreground">{patientName}</p>
              </div>
            </div>
          </div>

          {/* Signer Identity */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField id="consent-signer-name" label="Signer Name">
              <Input
                id="consent-signer-name"
                value={form.signerName}
                onChange={(e) => setForm((p) => ({ ...p, signerName: e.target.value }))}
                placeholder="Full Legal Name"
                className="min-h-11"
                data-testid="consent-signer-input"
              />
            </FormField>

            <div className="space-y-1.5">
              <Label htmlFor="consent-relationship">Relationship to Patient</Label>
              <Select
                value={form.signerRelationship}
                onValueChange={(val) => setForm((p) => ({ ...p, signerRelationship: val as SignerRelationship }))}
              >
                <SelectTrigger id="consent-relationship" className="min-h-11 w-full" data-testid="consent-relationship-select">
                  <SelectValue placeholder="Select relationship" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="patient">Patient (Self)</SelectItem>
                  <SelectItem value="legal_guardian">Legal Guardian</SelectItem>
                  <SelectItem value="healthcare_proxy">Healthcare Proxy</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Risks & Alternatives Acknowledgment */}
          <div className="flex items-start gap-3 rounded-lg border border-border/80 bg-background p-3">
            <Checkbox
              id="consent-risks-acknowledged"
              checked={form.risksAcknowledged}
              onCheckedChange={(checked) => setForm((p) => ({ ...p, risksAcknowledged: checked === true }))}
              className="mt-0.5 size-5"
              data-testid="consent-risks-checkbox"
            />
            <Label htmlFor="consent-risks-acknowledged" className="text-xs leading-normal font-normal text-muted-foreground cursor-pointer">
              I certify that the nature, purpose, benefits, risks, and alternatives of the procedure have been explained to me, and all questions have been answered satisfactorily.
            </Label>
          </div>

          {/* Digital Signature Pad */}
          <div className="space-y-1.5">
            <Label>Digital Tablet Signature</Label>
            <SignaturePad
              label="Informed consent signature"
              onChange={(dataUrl) => setForm((p) => ({ ...p, signatureDataUrl: dataUrl }))}
              data-testid="consent-signature-pad"
            />
          </div>

          {/* Local Error Warning */}
          {form.localError && (
            <div
              className="flex items-center gap-2 rounded-md bg-destructive/10 p-2.5 text-xs font-medium text-destructive"
              data-testid="consent-error-message"
            >
              <ShieldAlert className="size-4 shrink-0" aria-hidden />
              <span>{form.localError}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <DialogClose render={<Button variant="outline" className="min-h-11" />}>
            Cancel
          </DialogClose>
          <Button
            onClick={() => void handleSubmit()}
            disabled={signConsentMutation.isPending || !form.risksAcknowledged || !form.signatureDataUrl}
            className="min-h-11"
            data-testid="consent-submit-button"
          >
            {signConsentMutation.isPending && <LoaderCircle className="animate-spin size-4" aria-hidden />}
            Attest & Sign Consent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
