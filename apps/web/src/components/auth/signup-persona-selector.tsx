"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Stethoscope,
  ShieldAlert,
  HeartPulse,
  Building2,
  UserCircle,
  Loader2,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { Badge, Button, Card, Input, Label, cn } from "@asc/ui";
import type { UserRole } from "@asc/types";
import { signupSchema, type SignupFormData } from "@asc/validation";
import { useAuth } from "../../hooks/use-auth";

const ROLE_OPTIONS = [
  {
    role: "SURGEON" as UserRole,
    title: "Gastroenterologist / Proceduralist",
    icon: Stethoscope,
    badge: "MD / DO",
    description: "GI endoscopy documentation, operative note attestation & quality tracking.",
  },
  {
    role: "ANESTHESIOLOGIST" as UserRole,
    title: "Anesthesiology Provider",
    icon: ShieldAlert,
    badge: "MD / CRNA",
    description: "Pre-procedure airway scoring, ASA physical status & sedation care.",
  },
  {
    role: "NURSE" as UserRole,
    title: "Clinical Nurse (Pre-Op / PACU / OR)",
    icon: HeartPulse,
    badge: "BSN / RN",
    description: "Intake vitals, Universal Protocol time-out & post-op Aldrete recovery.",
  },
  {
    role: "ADMIN" as UserRole,
    title: "ASC Center Administration",
    icon: Building2,
    badge: "Ops / Billing",
    description: "OR scheduling, digital whiteboard, billing hand-off & HIPAA audit review.",
  },
  {
    role: "PATIENT" as UserRole,
    title: "Patient Portal Access",
    icon: UserCircle,
    badge: "Outpatient",
    description: "Bowel prep tracking, NPO countdown, escort driver setup & care instructions.",
  },
] as const;

/** Demo auto-fill presets per role, kept as data instead of imperative per-field setState calls. */
const DEMO_PRESETS: Record<UserRole, Partial<SignupFormData>> = {
  SURGEON: {
    fullName: "Dr. Marcus Brody, MD",
    email: "m.brody@gihealth.org",
    npi: "1829304912",
    licenseNumber: "MD-772910-FL",
    specialty: "Advanced Therapeutic Endoscopy",
    department: "Endoscopy Surgical Suite",
  },
  ANESTHESIOLOGIST: {
    fullName: "Dr. Rachel Kim, MD",
    email: "r.kim@anesthesiapartners.org",
    npi: "1948201948",
    licenseNumber: "MD-881923-FL",
    specialty: "Sedation & Ambulatory Anesthesia",
    department: "Anesthesia Care Team",
  },
  NURSE: {
    fullName: "David Miller, BSN, RN",
    email: "d.miller@gihealth.org",
    licenseNumber: "RN-901824-FL",
    careStage: "Intra-op Circulator",
    department: "Clinical Nursing Staff",
  },
  ADMIN: {
    fullName: "Claire Davenport",
    email: "c.davenport@gihealth.org",
    facilityCode: "ASC-FL-991",
    department: "Surgery Center Management",
  },
  PATIENT: {
    fullName: "Eleanor Vance",
    email: "eleanor.vance@mail.com",
    dateOfBirth: "1962-03-15",
    escortName: "Thomas Vance (Son)",
    escortPhone: "(555) 442-8901",
  },
};

const DEFAULT_PASSWORD = "Password@123";

const DEFAULT_VALUES: SignupFormData = {
  role: "SURGEON",
  password: DEFAULT_PASSWORD,
  ...DEMO_PRESETS.SURGEON,
} as SignupFormData;

export function SignupPersonaSelector() {
  const { signup, isSigningUp } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    getValues,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const selectedRole = useWatch({ control, name: "role" });

  const handleSelectRole = (role: UserRole) => {
    reset({ role, password: getValues("password"), ...DEMO_PRESETS[role] });
    setFormError(null);
  };

  const onSubmit = async (data: SignupFormData) => {
    setFormError(null);
    try {
      await signup(data);
    } catch {
      setFormError("Registration could not be completed. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Role Picker Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Step 1: Select Your Role
            </Label>
            <p className="text-xs text-muted-foreground">
              Choose the role you will perform at the Ambulatory Surgery Center:
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => handleSelectRole(selectedRole)}
            className="text-xs gap-1 border-border/80"
          >
            <Sparkles className="h-3 w-3 text-amber-500" />
            Auto-Fill Sample Data
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {ROLE_OPTIONS.map((item) => {
            const Icon = item.icon;
            const isSelected = selectedRole === item.role;
            return (
              <Card
                key={item.role}
                onClick={() => handleSelectRole(item.role)}
                className={cn(
                  "cursor-pointer transition-all border p-3 flex flex-col justify-between",
                  isSelected
                    ? "border-foreground bg-accent/40 shadow-xs ring-1 ring-foreground/20"
                    : "border-border/70 hover:border-foreground/40 bg-card/60"
                )}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div
                      className={cn(
                        "p-1.5 rounded-md",
                        isSelected ? "bg-foreground text-background" : "bg-muted text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    {isSelected && <CheckCircle2 className="h-4 w-4 text-foreground" />}
                    {!isSelected && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {item.badge}
                      </Badge>
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-foreground leading-tight">
                      {item.title}
                    </h4>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1">
                      {item.description}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Role-Specific Form Fields */}
      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4 pt-2">
        <div className="border-t border-border pt-4">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-3">
            Step 2: Account & Credential Details
          </Label>

          {formError && (
            <div className="p-3 mb-4 text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/20">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="signup-name" className="text-xs font-medium">
                Full Legal Name
              </Label>
              <Input
                id="signup-name"
                disabled={isSigningUp}
                className="h-8 text-xs"
                {...register("fullName")}
              />
              {errors.fullName && (
                <p className="text-[10px] text-destructive">{errors.fullName.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="signup-email" className="text-xs font-medium">
                Email Address
              </Label>
              <Input
                id="signup-email"
                type="email"
                disabled={isSigningUp}
                className="h-8 text-xs"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-[10px] text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="signup-pwd" className="text-xs font-medium">
                Password
              </Label>
              <Input
                id="signup-pwd"
                type="password"
                disabled={isSigningUp}
                className="h-8 text-xs"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-[10px] text-destructive">{errors.password.message}</p>
              )}
            </div>

            {/* Clinician Specific: NPI & License */}
            {(selectedRole === "SURGEON" || selectedRole === "ANESTHESIOLOGIST") && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="signup-npi" className="text-xs font-medium">
                    10-Digit National Provider Identifier (NPI)
                  </Label>
                  <Input
                    id="signup-npi"
                    maxLength={10}
                    disabled={isSigningUp}
                    className="h-8 text-xs font-mono"
                    {...register("npi")}
                  />
                  {errors.npi && (
                    <p className="text-[10px] text-destructive">{errors.npi.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="signup-license" className="text-xs font-medium">
                    State Medical License #
                  </Label>
                  <Input
                    id="signup-license"
                    disabled={isSigningUp}
                    className="h-8 text-xs font-mono"
                    {...register("licenseNumber")}
                  />
                  {errors.licenseNumber && (
                    <p className="text-[10px] text-destructive">{errors.licenseNumber.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="signup-spec" className="text-xs font-medium">
                    Clinical Specialty
                  </Label>
                  <Input
                    id="signup-spec"
                    disabled={isSigningUp}
                    className="h-8 text-xs"
                    {...register("specialty")}
                  />
                </div>
              </>
            )}

            {/* Nurse Specific: License & Stage */}
            {selectedRole === "NURSE" && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="signup-rn" className="text-xs font-medium">
                    Registered Nurse License #
                  </Label>
                  <Input
                    id="signup-rn"
                    disabled={isSigningUp}
                    className="h-8 text-xs font-mono"
                    {...register("licenseNumber")}
                  />
                  {errors.licenseNumber && (
                    <p className="text-[10px] text-destructive">{errors.licenseNumber.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="signup-carestage" className="text-xs font-medium">
                    Primary Stage of Care
                  </Label>
                  <Input
                    id="signup-carestage"
                    disabled={isSigningUp}
                    className="h-8 text-xs"
                    {...register("careStage")}
                  />
                  {errors.careStage && (
                    <p className="text-[10px] text-destructive">{errors.careStage.message}</p>
                  )}
                </div>
              </>
            )}

            {/* Admin Specific: Facility Code */}
            {selectedRole === "ADMIN" && (
              <div className="space-y-1">
                <Label htmlFor="signup-fac" className="text-xs font-medium">
                  ASC Facility Identifier
                </Label>
                <Input
                  id="signup-fac"
                  disabled={isSigningUp}
                  className="h-8 text-xs font-mono"
                  {...register("facilityCode")}
                />
                {errors.facilityCode && (
                  <p className="text-[10px] text-destructive">{errors.facilityCode.message}</p>
                )}
              </div>
            )}

            {/* Patient Specific: DOB, Escort Name & Phone */}
            {selectedRole === "PATIENT" && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="signup-dob" className="text-xs font-medium">
                    Date of Birth
                  </Label>
                  <Input
                    id="signup-dob"
                    type="date"
                    disabled={isSigningUp}
                    className="h-8 text-xs"
                    {...register("dateOfBirth")}
                  />
                  {errors.dateOfBirth && (
                    <p className="text-[10px] text-destructive">{errors.dateOfBirth.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="signup-escort-name" className="text-xs font-medium">
                    Escort / Responsible Adult Driver Name
                  </Label>
                  <Input
                    id="signup-escort-name"
                    placeholder="Name of adult accompanying patient"
                    disabled={isSigningUp}
                    className="h-8 text-xs"
                    {...register("escortName")}
                  />
                  {errors.escortName && (
                    <p className="text-[10px] text-destructive">{errors.escortName.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="signup-escort-phone" className="text-xs font-medium">
                    Escort Contact Phone Number
                  </Label>
                  <Input
                    id="signup-escort-phone"
                    placeholder="(555) 000-0000"
                    disabled={isSigningUp}
                    className="h-8 text-xs"
                    {...register("escortPhone")}
                  />
                  {errors.escortPhone && (
                    <p className="text-[10px] text-destructive">{errors.escortPhone.message}</p>
                  )}
                </div>
              </>
            )}
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
            <Link
              href="/login"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Sign In with 1-Click Demo
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
