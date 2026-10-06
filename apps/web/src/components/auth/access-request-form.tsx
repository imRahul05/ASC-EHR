"use client";

import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { requestAccess } from "@asc/api-client";
import { Button } from "@asc/ui/components/ui/button";
import { FormField, type FieldConfig } from "@asc/ui/components/form/form-field";
import { Input } from "@asc/ui/components/ui/input";
import { cn } from "@asc/ui/lib/utils";
import { CircleCheck, Loader2 } from "@asc/ui/icons";
import { accessRequestSchema, type AccessRequestFormData } from "@asc/validation/auth";

/** Inputs in display order; the Zod schema in @asc/validation says which are required. */
const FIELDS: readonly FieldConfig<keyof AccessRequestFormData>[] = [
  { name: "fullName", label: "Full name", autoComplete: "name" },
  { name: "email", label: "Work email", type: "email", autoComplete: "email" },
  { name: "facilityCode", label: "Facility ID (optional)", mono: true },
];

/**
 * Request access: asks an administrator for an account. There is no role to pick: roles are
 * assigned by the administrator who invites you.
 */
export function AccessRequestForm() {
  const request = useMutation({ mutationFn: requestAccess });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<AccessRequestFormData>({ resolver: zodResolver(accessRequestSchema) });

  const onSubmit = async (data: AccessRequestFormData) => {
    try {
      await request.mutateAsync(data);
    } catch {
      setError("root", { message: "Your request could not be sent. Please try again." });
    }
  };

  if (request.isSuccess) {
    return (
      <div role="status" className="space-y-3 rounded-xl border border-border bg-card p-5" data-testid="access-request-received">
        <CircleCheck aria-hidden className="size-5 text-success" />
        <p className="text-sm font-medium">Request received</p>
        <p className="text-sm text-muted-foreground">
          An administrator will review it and send an invitation. Your role is set when they invite you.
        </p>
        <Link href="/login" className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} className="space-y-4" noValidate>
      {errors.root && (
        <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          {errors.root.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {FIELDS.map((field) => (
          <FormField key={field.name} id={`access-${field.name}`} label={field.label} error={errors[field.name]?.message}>
            <Input
              id={`access-${field.name}`}
              type={field.type ?? "text"}
              autoComplete={field.autoComplete}
              disabled={request.isPending}
              aria-invalid={errors[field.name] ? true : undefined}
              className={cn("h-9", field.mono && "font-mono")}
              {...register(field.name)}
            />
          </FormField>
        ))}
      </div>

      <Button type="submit" disabled={request.isPending} className="h-9 w-full font-medium" data-testid="access-request-submit">
        {request.isPending && <Loader2 aria-hidden className="animate-spin" />}
        {request.isPending ? "Sending…" : "Request access"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
