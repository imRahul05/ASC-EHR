"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@asc/api-client";
import { useUpdateMyEscort } from "@asc/api-client/react";
import type { Escort } from "@asc/types";
import { escortSchema, type EscortFormData } from "@asc/validation/escort";
import { Button, Checkbox, FormField, Input, Label, SectionCard, toast, type FieldConfig } from "@asc/ui";
import { CircleCheck, LoaderCircle, Phone, UserRound, UsersRound } from "@asc/ui/icons";

type TextField = Exclude<keyof EscortFormData, "confirmed">;

const FIELDS: readonly FieldConfig<TextField>[] = [
  { name: "name", label: "Escort's full name", autoComplete: "off", icon: UserRound },
  { name: "relationship", label: "Relationship to you", placeholder: "e.g. spouse, friend", autoComplete: "off", icon: UsersRound },
  { name: "phone", label: "Phone on the day", type: "tel", autoComplete: "off", icon: Phone },
];

interface EscortFormProps {
  readonly escort: Escort | null;
}

/** Portal escort details (required after sedation). react-hook-form + shared zod schema. */
export function EscortForm({ escort }: EscortFormProps) {
  const save = useUpdateMyEscort();
  const { register, handleSubmit, control, formState } = useForm<EscortFormData>({
    resolver: zodResolver(escortSchema),
    defaultValues: { name: escort?.name ?? "", relationship: escort?.relationship ?? "", phone: escort?.phone ?? "", confirmed: escort?.confirmed ?? false },
  });

  const onSubmit = (values: EscortFormData) =>
    save.mutate(values, {
      onSuccess: () => toast.success("Escort details saved. Thank you!"),
      onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not save — please try again"),
    });

  return (
    <SectionCard
      title="Your escort"
      description="After sedation you can't drive for 24 hours. An adult must take you home and stay with you."
      actions={
        escort?.confirmed ? (
          <span className="inline-flex items-center gap-1 text-sm text-success">
            <CircleCheck className="size-4" aria-hidden /> Confirmed
          </span>
        ) : undefined
      }
      data-testid="portal-escort"
    >
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} className="space-y-4" noValidate>
        {FIELDS.map((field) => (
          <FormField key={field.name} id={`escort-${field.name}`} label={field.label} icon={field.icon} error={formState.errors[field.name]?.message}>
            <Input
              id={`escort-${field.name}`}
              type={field.type ?? "text"}
              placeholder={field.placeholder}
              autoComplete={field.autoComplete}
              className="pl-9"
              aria-invalid={formState.errors[field.name] ? true : undefined}
              data-testid={`portal-escort-${field.name}`}
              {...register(field.name)}
            />
          </FormField>
        ))}
        <Controller
          control={control}
          name="confirmed"
          render={({ field }) => (
            <div className="flex items-start gap-3 rounded-lg border border-border/70 p-3">
              <Checkbox id="escort-confirmed" checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} data-testid="portal-escort-confirmed" />
              <Label htmlFor="escort-confirmed" className="text-sm leading-snug font-normal">
                I have asked this person and they will stay with me until I'm home.
              </Label>
            </div>
          )}
        />
        <Button type="submit" disabled={save.isPending} className="w-full sm:w-auto" data-testid="portal-escort-save">
          {save.isPending ? <LoaderCircle className="animate-spin" /> : null}
          Save escort
        </Button>
      </form>
    </SectionCard>
  );
}
