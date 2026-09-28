"use client";

import { useState } from "react";
import { useSignNote } from "@asc/api-client/react";
import type { ProcedureCase } from "@asc/types";
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
  Label,
  toast,
} from "@asc/ui";
import { LoaderCircle, PenLine } from "@asc/ui/icons";
import { notifyError } from "../notify-error";

interface SignNoteDialogProps {
  readonly procedureCase: ProcedureCase;
  readonly version: number;
  /** signGate result: sign stays disabled while any blocking gap is open. */
  readonly disabled: boolean;
}

/** Explicit, human signature (never auto-signed): confirm names the patient + action and requires attestation. */
export function SignNoteDialog({ procedureCase, version, disabled }: SignNoteDialogProps) {
  const [open, setOpen] = useState(false);
  const [attested, setAttested] = useState(false);
  const sign = useSignNote(procedureCase.id);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setAttested(false);
  };

  const confirm = () =>
    sign.mutate(undefined, {
      onSuccess: () => {
        toast.success(`Procedure note signed for ${procedureCase.caseNumber}`);
        onOpenChange(false);
      },
      onError: notifyError("Could not sign the note"),
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button size="sm" disabled={disabled} onClick={() => onOpenChange(true)} data-testid="note-sign-button">
        <PenLine /> Sign note
      </Button>
      <DialogContent data-testid="note-sign-dialog">
        <DialogHeader>
          <DialogTitle>Sign procedure note?</DialogTitle>
          <DialogDescription>
            You are signing the {procedureCase.procedureLabel.toLowerCase()} note (v{version}) for{" "}
            <strong className="text-foreground">{procedureCase.patient.displayName}</strong> · {procedureCase.caseNumber}. Signing locks the
            note and sends the codes to review. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-2 rounded-lg border border-border p-3">
          <Checkbox id="note-sign-attest" checked={attested} onCheckedChange={setAttested} className="mt-0.5" data-testid="note-sign-attest" />
          <Label htmlFor="note-sign-attest" className="text-sm leading-snug font-normal">
            I reviewed the AI draft, including every exception and suggestion, and attest that it accurately describes the procedure I performed.
          </Label>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Keep reviewing</DialogClose>
          <Button disabled={!attested || sign.isPending} onClick={confirm} data-testid="note-sign-confirm">
            {sign.isPending ? <LoaderCircle className="animate-spin" /> : <PenLine />}
            Sign for {procedureCase.patient.displayName}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
