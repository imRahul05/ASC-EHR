"use client";

import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, HeartPulse, Loader2, ShieldPlus, Sparkles, Stethoscope, UserRound } from "@asc/ui/icons";
import { Button, cn, FormField, Input, type FieldConfig } from "@asc/ui";
import type { UserRole } from "@asc/types";
import { SIGNUP_ROLE_FIELDS, signupSchema, type SignupFormData } from "@asc/validation/auth";
import { useAuth } from "../../hooks/use-auth";
import { SIGNUP_SAMPLE_PASSWORD, SIGNUP_SAMPLES } from "./signup-samples";

type SignupFieldName = Exclude<keyof SignupFormData, "role" | "department">;

/** Role cards — labels follow docs/product/07-mock-frontend.md §2. */
const ROLE_OPTIONS = [
  { role: "ADMIN", title: "Front desk / Admin", icon: Building2, description: "Scheduling, referrals, coding, audit" },
  { role: "NURSE", title: "Nurse", icon: HeartPulse, description: "Pre-op, procedure room, PACU" },
  { role: "SURGEON", title: "Gastroenterologist", icon: Stethoscope, description: "Procedures, notes, pathology" },
  { role: "ANESTHESIOLOGIST", title: "Anesthesia", icon: ShieldPlus, description: "ASA, airway, sedation record" },
  { role: "PATIENT", title: "Patient", icon: UserRound, description: "Prep, escort, results" },
] as const satisfies readonly { role: UserRole; title: string; icon: unknown; description: string }[];

/** How each input looks. Which inputs a role sees comes from SIGNUP_ROLE_FIELDS in @asc/validation. */
const FIELD_UI: Readonly<Record<SignupFieldName, FieldConfig<SignupFieldName>>> = {
  fullName: { name: "fullName", label: "Full legal name", autoComplete: "name" },
  email: { name: "email", label: "Email", type: "email", autoComplete: "email" },
  password: { name: "password", label: "Password", type: "password", autoComplete: "new-password" },
  npi: { name: "npi", label: "NPI (10 digits)", mono: true, maxLength: 10 },
  licenseNumber: { name: "licenseNumber", label: "License number", mono: true },
  specialty: { name: "specialty", label: "Specialty" },
  careStage: { name: "careStage", label: "Primary care area" },
  facilityCode: { name: "facilityCode", label: "Facility ID", mono: true },
  dateOfBirth: { name: "dateOfBirth", label: "Date of birth", type: "date" },
  escortName: { name: "escortName", label: "Escort name", placeholder: "Adult who drives you home" },
  escortPhone: { name: "escortPhone", label: "Escort phone", type: "tel", placeholder: "(555) 000-0000" },
};

const COMMON_FIELDS: readonly SignupFieldName[] = ["fullName", "email", "password"];

function fieldsForRole(role: UserRole): readonly FieldConfig<SignupFieldName>[] {
  const roleFields = SIGNUP_ROLE_FIELDS[role].map((rule) => rule.field).filter((name) => name !== "department");
  return [...COMMON_FIELDS, ...roleFields].map((name) => FIELD_UI[name]);
}

function sampleValues(role: UserRole, password: string): SignupFormData {
  return { role, password, fullName: "", email: "", ...SIGNUP_SAMPLES[role] };
}

export function SignupPersonaSelector() {
  const { signup, isSigningUp } = useAuth();
  const {
    register,
    handleSubmit,
    control,
    reset,
    getValues,
    setError,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: sampleValues("SURGEON", SIGNUP_SAMPLE_PASSWORD),
  });

  const selectedRole = useWatch({ control, name: "role" });
  const selectedTitle = ROLE_OPTIONS.find((item) => item.role === selectedRole)?.title ?? "";

  const selectRole = (role: UserRole) => reset(sampleValues(role, getValues("password")));

  const onSubmit = async (data: SignupFormData) => {
    try {
      await signup(data);
    } catch {
      setError("root", { message: "Registration could not be completed. Please try again." });
    }
  };

  return (
    <div className="space-y-6">
      <fieldset className="space-y-3">
        <div className="flex items-center justify-between">
          <legend className="text-sm font-medium">Your role</legend>
          <Button type="button" variant="ghost" size="xs" onClick={() => selectRole(selectedRole)} data-testid="signup-autofill">
            <Sparkles aria-hidden className="text-primary" />
            Fill sample data
          </Button>
        </div>
        <div role="radiogroup" aria-label="Your role" className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="signup-role-select">
          {ROLE_OPTIONS.map(({ role, title, icon: Icon, description }, index) => {
            const checked = role === selectedRole;
            return (
              <button
                key={role}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => selectRole(role)}
                data-testid={`signup-role-${role.toLowerCase()}`}
                className={cn(
                  "flex items-center gap-3 rounded-xl border bg-card p-3 text-left outline-none transition-colors motion-reduce:transition-none",
                  "hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/40",
                  checked ? "border-primary/50 bg-accent/60 ring-1 ring-primary/30" : "border-border",
                  index === ROLE_OPTIONS.length - 1 && "sm:col-span-2",
                )}
              >
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", checked ? "bg-primary text-primary-foreground" : "bg-muted")}>
                  <Icon aria-hidden className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} className="space-y-4" noValidate>
        {errors.root && (
          <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
            {errors.root.message}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fieldsForRole(selectedRole).map((field) => (
            <FormField key={field.name} id={`signup-${field.name}`} label={field.label} error={errors[field.name]?.message}>
              <Input
                id={`signup-${field.name}`}
                type={field.type ?? "text"}
                placeholder={field.placeholder}
                autoComplete={field.autoComplete}
                maxLength={field.maxLength}
                disabled={isSigningUp}
                aria-invalid={errors[field.name] ? true : undefined}
                className={cn("h-9", field.mono && "font-mono")}
                {...register(field.name)}
              />
            </FormField>
          ))}
        </div>

        <Button type="submit" disabled={isSigningUp} className="h-9 w-full font-medium" data-testid="signup-submit">
          {isSigningUp && <Loader2 aria-hidden className="animate-spin" />}
          {isSigningUp ? "Creating account…" : `Create ${selectedTitle.toLowerCase()} account`}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
