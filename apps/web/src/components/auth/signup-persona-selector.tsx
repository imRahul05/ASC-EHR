"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
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
import { Badge, Button, Card, Input, Label } from "@asc/ui";
import type { UserRole } from "@asc/types";
import { signupSchema } from "@asc/validation";
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

export function SignupPersonaSelector() {
  const { signup, isSigningUp } = useAuth();
  const [selectedRole, setSelectedRole] = useState<UserRole>("SURGEON");

  // Form State
  const [fullName, setFullName] = useState("Dr. Marcus Brody, MD");
  const [email, setEmail] = useState("m.brody@gihealth.org");
  const [password, setPassword] = useState("Password@123");
  const [npi, setNpi] = useState("1829304912");
  const [licenseNumber, setLicenseNumber] = useState("MD-772910-FL");
  const [specialty, setSpecialty] = useState("Advanced Therapeutic Endoscopy");
  const [careStage, setCareStage] = useState("PACU Stage 2 Recovery");
  const [department, setDepartment] = useState("Endoscopy Services");
  const [facilityCode, setFacilityCode] = useState("ASC-FL-991");
  const [dateOfBirth, setDateOfBirth] = useState("1975-08-20");
  const [escortName, setEscortName] = useState("Sarah Brody (Spouse)");
  const [escortPhone, setEscortPhone] = useState("(555) 789-0123");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleFillDemoData = (role: UserRole) => {
    setSelectedRole(role);
    setFieldErrors({});

    if (role === "SURGEON") {
      setFullName("Dr. Marcus Brody, MD");
      setEmail("m.brody@gihealth.org");
      setNpi("1829304912");
      setLicenseNumber("MD-772910-FL");
      setSpecialty("Advanced Therapeutic Endoscopy");
      setDepartment("Endoscopy Surgical Suite");
    } else if (role === "ANESTHESIOLOGIST") {
      setFullName("Dr. Rachel Kim, MD");
      setEmail("r.kim@anesthesiapartners.org");
      setNpi("1948201948");
      setLicenseNumber("MD-881923-FL");
      setSpecialty("Sedation & Ambulatory Anesthesia");
      setDepartment("Anesthesia Care Team");
    } else if (role === "NURSE") {
      setFullName("David Miller, BSN, RN");
      setEmail("d.miller@gihealth.org");
      setLicenseNumber("RN-901824-FL");
      setCareStage("Intra-op Circulator");
      setDepartment("Clinical Nursing Staff");
    } else if (role === "ADMIN") {
      setFullName("Claire Davenport");
      setEmail("c.davenport@gihealth.org");
      setFacilityCode("ASC-FL-991");
      setDepartment("Surgery Center Management");
    } else if (role === "PATIENT") {
      setFullName("Eleanor Vance");
      setEmail("eleanor.vance@mail.com");
      setDateOfBirth("1962-03-15");
      setEscortName("Thomas Vance (Son)");
      setEscortPhone("(555) 442-8901");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFieldErrors({});

    const payload = {
      role: selectedRole,
      fullName,
      email,
      password,
      npi: selectedRole === "SURGEON" || selectedRole === "ANESTHESIOLOGIST" ? npi : undefined,
      licenseNumber:
        selectedRole === "SURGEON" || selectedRole === "ANESTHESIOLOGIST" || selectedRole === "NURSE"
          ? licenseNumber
          : undefined,
      specialty: selectedRole === "SURGEON" || selectedRole === "ANESTHESIOLOGIST" ? specialty : undefined,
      careStage: selectedRole === "NURSE" ? careStage : undefined,
      department: selectedRole !== "PATIENT" ? department : undefined,
      facilityCode: selectedRole === "ADMIN" ? facilityCode : undefined,
      dateOfBirth: selectedRole === "PATIENT" ? dateOfBirth : undefined,
      escortName: selectedRole === "PATIENT" ? escortName : undefined,
      escortPhone: selectedRole === "PATIENT" ? escortPhone : undefined,
    };

    const parseResult = signupSchema.safeParse(payload);
    if (!parseResult.success) {
      const errMap: Record<string, string> = {};
      parseResult.error.issues.forEach((issue) => {
        const path = String(issue.path[0]);
        errMap[path] = issue.message;
      });
      setFieldErrors(errMap);
      return;
    }

    try {
      await signup(payload);
    } catch {
      setFieldErrors({ form: "Registration could not be completed. Please try again." });
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
            onClick={() => handleFillDemoData(selectedRole)}
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
                onClick={() => handleFillDemoData(item.role)}
                className={`cursor-pointer transition-all border p-3 flex flex-col justify-between ${
                  isSelected
                    ? "border-foreground bg-accent/40 shadow-xs ring-1 ring-foreground/20"
                    : "border-border/70 hover:border-foreground/40 bg-card/60"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div
                      className={`p-1.5 rounded-md ${
                        isSelected ? "bg-foreground text-background" : "bg-muted text-foreground"
                      }`}
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
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 pt-2">
        <div className="border-t border-border pt-4">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-3">
            Step 2: Account & Credential Details
          </Label>

          {fieldErrors.form && (
            <div className="p-3 mb-4 text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/20">
              {fieldErrors.form}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="signup-name" className="text-xs font-medium">
                Full Legal Name
              </Label>
              <Input
                id="signup-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isSigningUp}
                className="h-8 text-xs"
              />
              {fieldErrors.fullName && (
                <p className="text-[10px] text-destructive">{fieldErrors.fullName}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="signup-email" className="text-xs font-medium">
                Email Address
              </Label>
              <Input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSigningUp}
                className="h-8 text-xs"
              />
              {fieldErrors.email && (
                <p className="text-[10px] text-destructive">{fieldErrors.email}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="signup-pwd" className="text-xs font-medium">
                Password
              </Label>
              <Input
                id="signup-pwd"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSigningUp}
                className="h-8 text-xs"
              />
              {fieldErrors.password && (
                <p className="text-[10px] text-destructive">{fieldErrors.password}</p>
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
                    value={npi}
                    maxLength={10}
                    onChange={(e) => setNpi(e.target.value)}
                    disabled={isSigningUp}
                    className="h-8 text-xs font-mono"
                  />
                  {fieldErrors.npi && (
                    <p className="text-[10px] text-destructive">{fieldErrors.npi}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="signup-license" className="text-xs font-medium">
                    State Medical License #
                  </Label>
                  <Input
                    id="signup-license"
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    disabled={isSigningUp}
                    className="h-8 text-xs font-mono"
                  />
                  {fieldErrors.licenseNumber && (
                    <p className="text-[10px] text-destructive">{fieldErrors.licenseNumber}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="signup-spec" className="text-xs font-medium">
                    Clinical Specialty
                  </Label>
                  <Input
                    id="signup-spec"
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    disabled={isSigningUp}
                    className="h-8 text-xs"
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
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    disabled={isSigningUp}
                    className="h-8 text-xs font-mono"
                  />
                  {fieldErrors.licenseNumber && (
                    <p className="text-[10px] text-destructive">{fieldErrors.licenseNumber}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="signup-carestage" className="text-xs font-medium">
                    Primary Stage of Care
                  </Label>
                  <Input
                    id="signup-carestage"
                    value={careStage}
                    onChange={(e) => setCareStage(e.target.value)}
                    disabled={isSigningUp}
                    className="h-8 text-xs"
                  />
                  {fieldErrors.careStage && (
                    <p className="text-[10px] text-destructive">{fieldErrors.careStage}</p>
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
                  value={facilityCode}
                  onChange={(e) => setFacilityCode(e.target.value)}
                  disabled={isSigningUp}
                  className="h-8 text-xs font-mono"
                />
                {fieldErrors.facilityCode && (
                  <p className="text-[10px] text-destructive">{fieldErrors.facilityCode}</p>
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
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    disabled={isSigningUp}
                    className="h-8 text-xs"
                  />
                  {fieldErrors.dateOfBirth && (
                    <p className="text-[10px] text-destructive">{fieldErrors.dateOfBirth}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="signup-escort-name" className="text-xs font-medium">
                    Escort / Responsible Adult Driver Name
                  </Label>
                  <Input
                    id="signup-escort-name"
                    value={escortName}
                    placeholder="Name of adult accompanying patient"
                    onChange={(e) => setEscortName(e.target.value)}
                    disabled={isSigningUp}
                    className="h-8 text-xs"
                  />
                  {fieldErrors.escortName && (
                    <p className="text-[10px] text-destructive">{fieldErrors.escortName}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="signup-escort-phone" className="text-xs font-medium">
                    Escort Contact Phone Number
                  </Label>
                  <Input
                    id="signup-escort-phone"
                    value={escortPhone}
                    placeholder="(555) 000-0000"
                    onChange={(e) => setEscortPhone(e.target.value)}
                    disabled={isSigningUp}
                    className="h-8 text-xs"
                  />
                  {fieldErrors.escortPhone && (
                    <p className="text-[10px] text-destructive">{fieldErrors.escortPhone}</p>
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
