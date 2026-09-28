"use client";

import { useState } from "react";
import { ApiError } from "@asc/api-client";
import { useSignConsent } from "@asc/api-client/react";
import type { Consent } from "@asc/types";
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
  SignaturePad,
  toast,
} from "@asc/ui";
import { FileSignature, LoaderCircle } from "@asc/ui/icons";

interface ConsentSignDialogProps {
  readonly caseId: string;
  readonly consent: Consent | null;
  readonly patientName: string;
  readonly witnessName: string;
  readonly onClose: () => void;
}

/** Signature capture for one consent. Names the patient and the document (irreversible action rule). */
export function ConsentSignDialog({ caseId, consent, patientName, witnessName, onClose }: ConsentSignDialogProps) {
  const [draft, setDraft] = useState<{ signerName: string; signature: string | null }>({ signerName: patientName, signature: null });
  const sign = useSignConsent(caseId);
  const ready = draft.signerName.trim().length > 1 && draft.signature !== null;

  const close = () => {
    setDraft({ signerName: patientName, signature: null });
    onClose();
  };

  const submit = () => {
    if (!consent || !draft.signature) return;
    sign.mutate(
      { consentId: consent.id, signerName: draft.signerName.trim(), signatureDataUrl: draft.signature },
      {
        onSuccess: () => {
          toast.success(`${consent.title} signed`);
          close();
        },
        onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not sign the consent"),
      },
    );
  };

  return (
    <Dialog open={consent !== null} onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent className="sm:max-w-lg" data-testid="consent-sign-dialog">
        <DialogHeader>
          <DialogTitle>{consent?.title}</DialogTitle>
          <DialogDescription>
            For <strong>{patientName}</strong>. {consent?.summary} Confirm the patient has had the chance to ask questions.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FormField id="consent-signer" label="Signer (patient or legal representative)">
            <Input
              id="consent-signer"
              className="h-11"
              autoComplete="off"
              value={draft.signerName}
              onChange={(event) => setDraft((current) => ({ ...current, signerName: event.target.value }))}
              data-testid="consent-signer"
            />
          </FormField>
          <SignaturePad
            label="Signer signature"
            onChange={(signature) => setDraft((current) => ({ ...current, signature }))}
            data-testid="consent-signature"
          />
          <p className="text-xs text-muted-foreground">Witness: {witnessName} (you)</p>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" className="min-h-11" />}>Cancel</DialogClose>
          <Button className="min-h-11" disabled={!ready || sign.isPending} onClick={submit} data-testid="consent-sign-submit">
            {sign.isPending ? <LoaderCircle className="animate-spin" /> : <FileSignature aria-hidden />}
            Sign consent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
