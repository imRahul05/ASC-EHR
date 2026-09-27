"use client";

import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, HeartPulse, Loader2, ShieldAlert, Sparkles, Stethoscope, UserCircle } from "@asc/ui/icons";
import {
  Badge,
  Button,
  cn,
  FormField,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type FieldConfig,
} from "@asc/ui";
import type { UserRole } from "@asc/types";
import { SIGNUP_ROLE_FIELDS, signupSchema, type SignupFormData } from "@asc/validation/auth";
import { useAuth } from "../../hooks/use-auth";
import { SIGNUP_SAMPLE_PASSWORD, SIGNUP_SAMPLES } from "./signup-samples";

type SignupFieldName = Exclude<keyof SignupFormData, "role" | "department">;

const ROLE_OPTIONS = [
  {
    role: "SURGEON",
    title: "Gastroenterologist / Proceduralist",
    icon: Stethoscope,
    badge: "MD / DO",
    description: "GI endoscopy documentation, operative note attestation & quality tracking.",
  },
  {
    role: "ANESTHESIOLOGIST",
    title: "Anesthesiology Provider",
    icon: ShieldAlert,
    badge: "MD / CRNA",
    description: "Pre-procedure airway scoring, ASA physical status & sedation care.",
  },
  {
    role: "NURSE",
    title: "Clinical Nurse (Pre-Op / PACU / OR)",
    icon: HeartPulse,
    badge: "BSN / RN",
    description: "Intake vitals, Universal Protocol time-out & post-op Aldrete recovery.",
  },
  {
    role: "ADMIN",
    title: "ASC Center Administration",
    icon: Building2,
    badge: "Ops / Billing",
    description: "OR scheduling, digital whiteboard, billing hand-off & HIPAA audit review.",
  },
  {
    role: "PATIENT",
    title: "Patient Portal Access",
    icon: UserCircle,
    badge: "Outpatient",
    description: "Bowel prep tracking, NPO countdown, escort driver setup & care instructions.",
  },
] as const satisfies readonly { role: UserRole; title: string; icon: unknown; badge: string; description: string }[];

/** How each input looks. Which inputs a role sees comes from SIGNUP_ROLE_FIELDS in @asc/validation. */
const FIELD_UI: Readonly<Record<SignupFieldName, FieldConfig<SignupFieldName>>> = {
  fullName: { name: "fullName", label: "Full Legal Name", autoComplete: "name" },
  email: { name: "email", label: "Email Address", type: "email", autoComplete: "email" },
  password: { name: "password", label: "Password", type: "password", autoComplete: "new-password" },
  npi: { name: "npi", label: "10-Digit National Provider Identifier (NPI)", mono: true, maxLength: 10 },
  licenseNumber: { name: "licenseNumber", label: "License Number", mono: true },
  specialty: { name: "specialty", label: "Clinical Specialty" },
  careStage: { name: "careStage", label: "Primary Stage of Care" },
  facilityCode: { name: "facilityCode", label: "ASC Facility Identifier", mono: true },
  dateOfBirth: { name: "dateOfBirth", label: "Date of Birth", type: "date" },
  escortName: { name: "escortName", label: "Escort / Responsible Adult Driver Name", placeholder: "Name of adult accompanying patient" },
  escortPhone: { name: "escortPhone", label: "Escort Contact Phone Number", type: "tel", placeholder: "(555) 000-0000" },
};

const COMMON_FIELDS: readonly SignupFieldName[] = ["fullName", "email", "password"];

function fieldsForRole(role: UserRole): readonly FieldConfig<SignupFieldName>[] {
  const roleFields = SIGNUP_ROLE_FIELDS[role].map((rule) => rule.field).filter((name) => name !== "department");
  return [...COMMON_FIELDS, ...roleFields].map((name) => FIELD_UI[name]);
}

function sampleValues(role: UserRole, password: string): SignupFormData {
  return { role, password, fullName: "", email: "", ...SIGNUP_SAMPLES[role] };
}

const ROLE_SELECT_ITEMS = ROLE_OPTIONS.map((item) => ({ value: item.role, label: item.title }));

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
  const selectedOption = ROLE_OPTIONS.find((item) => item.role === selectedRole);

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
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Step 1: Select Your Role
            </Label>
            <p className="text-xs text-muted-foreground">Choose the role you will perform at the Ambulatory Surgery Center:</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => selectRole(selectedRole)}
            className="text-xs gap-1 border-border/80"
          >
            <Sparkles className="h-3 w-3 text-amber-500" />
            Auto-Fill Sample Data
          </Button>
        </div>

        <Select items={ROLE_SELECT_ITEMS} value={selectedRole} onValueChange={(value) => value && selectRole(value)}>
          <SelectTrigger className="w-full h-9 text-xs" data-testid="signup-role-select">
            <SelectValue placeholder="Select your role" />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map(({ role, title, icon: Icon }) => (
              <SelectItem key={role} value={role} className="text-xs">
                <Icon className="h-3.5 w-3.5" />
                {title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedOption && (
          <div className="flex items-start gap-2.5 rounded-md border border-border/70 bg-muted/30 p-2.5">
            <Badge variant="outline" className="text-[10px] font-normal shrink-0">
              {selectedOption.badge}
            </Badge>
            <p className="text-[11px] text-muted-foreground">{selectedOption.description}</p>
          </div>
        )}
      </div>

      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} className="space-y-4 pt-2" noValidate>
        <div className="border-t border-border pt-4">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-3">
            Step 2: Account & Credential Details
          </Label>

          {errors.root && (
            <div role="alert" className="p-3 mb-4 text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/20">
              {errors.root.message}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  className={cn("h-8 text-xs", field.mono && "font-mono")}
                  {...register(field.name)}
                />
              </FormField>
            ))}
          </div>
        </div>

        <div className="pt-2">
          <Button type="submit" disabled={isSigningUp} className="w-full h-9 font-medium text-sm">
            {isSigningUp ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Clinical Profile...
              </>
            ) : (
              `Complete Registration as ${selectedRole}`
            )}
          </Button>
        </div>

        <div className="text-center pt-2">
          <p className="text-xs text-muted-foreground">
            Already have an active credential or demo session?{" "}
            <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
              Sign In with 1-Click Demo
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
