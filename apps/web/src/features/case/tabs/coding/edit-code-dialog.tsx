"use client";

import { useForm } from "react-hook-form";
import type { CodingSuggestion } from "@asc/types";
import { Button, Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, FormField, Input } from "@asc/ui";

interface EditForm {
  readonly code: string;
  readonly description: string;
}

interface EditCodeDialogProps {
  readonly suggestion: CodingSuggestion | null;
  readonly pending: boolean;
  readonly onCancel: () => void;
  readonly onSave: (edit: EditForm) => void;
}

/** Coder replaces an AI code (status → edited; clinician edits always win). */
export function EditCodeDialog({ suggestion, pending, onCancel, onSave }: EditCodeDialogProps) {
  return (
    <Dialog open={suggestion !== null} onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent>
        {suggestion && <EditCodeForm key={suggestion.id} suggestion={suggestion} pending={pending} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  );
}

function EditCodeForm({ suggestion, pending, onSave }: { readonly suggestion: CodingSuggestion; readonly pending: boolean; readonly onSave: (edit: EditForm) => void }) {
  const { register, handleSubmit, formState } = useForm<EditForm>({ defaultValues: { code: suggestion.code, description: suggestion.description } });
  return (
    <form onSubmit={(event) => void handleSubmit(onSave)(event)} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Edit {suggestion.code}</DialogTitle>
        <DialogDescription>AI suggested: {suggestion.description}. Your code replaces it and is marked as edited.</DialogDescription>
      </DialogHeader>
      <FormField id="coding-edit-code" label="Code" error={formState.errors.code?.message}>
        <Input id="coding-edit-code" className="font-mono" {...register("code", { required: "Enter a code", pattern: { value: /^[A-Z0-9.]{2,8}$/, message: "2–8 letters/digits" } })} data-testid="coding-edit-code" />
      </FormField>
      <FormField id="coding-edit-description" label="Description" error={formState.errors.description?.message}>
        <Input id="coding-edit-description" {...register("description", { required: "Enter a description" })} data-testid="coding-edit-description" />
      </FormField>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
        <Button type="submit" disabled={pending} data-testid="coding-edit-save">
          Save edit
        </Button>
      </DialogFooter>
    </form>
  );
}
