"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@asc/ui";
import { RotateCcw } from "@asc/ui/icons";

interface RegenerateButtonProps {
  readonly version: number;
  readonly editedCount: number;
  readonly onConfirm: () => void;
}

/** Regenerating replaces the draft, so it asks first when the clinician has edits to lose. */
export function RegenerateButton({ version, editedCount, onConfirm }: RegenerateButtonProps) {
  const [open, setOpen] = useState(false);
  const request = () => (editedCount > 0 ? setOpen(true) : onConfirm());
  return (
    <>
      <Button size="sm" variant="outline" onClick={request} data-testid="note-regenerate">
        <RotateCcw /> Regenerate
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace draft v{version}?</DialogTitle>
            <DialogDescription>
              {editedCount} section{editedCount === 1 ? "" : "s"} you edited and any resolved gaps will be replaced by a new AI draft.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Keep my edits</DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
              data-testid="note-regenerate-confirm"
            >
              Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
