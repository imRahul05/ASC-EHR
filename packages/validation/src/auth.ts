import { z } from "zod";

// Authentication and multi-persona signup schemas (shared by apps/web forms and apps/api).

export const userRoleSchema = z.enum(["SURGEON", "ANESTHESIOLOGIST", "NURSE", "ADMIN", "PATIENT"]);

export type UserRoleValue = z.infer<typeof userRoleSchema>;

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export type LoginFormData = z.infer<typeof loginSchema>;

/** Optional profile fields that only some roles fill in at signup. */
const roleFieldShape = {
  npi: z.string().optional(),
  licenseNumber: z.string().optional(),
  specialty: z.string().optional(),
  careStage: z.string().optional(),
  department: z.string().optional(),
  facilityCode: z.string().optional(),
  dateOfBirth: z.string().optional(),
  escortName: z.string().optional(),
  escortPhone: z.string().optional(),
};

export type SignupRoleField = keyof typeof roleFieldShape;

export interface SignupRoleFieldRule {
  readonly field: SignupRoleField;
  /** Message shown when a required field fails `isValid`. Omitted = optional field. */
  readonly requiredMessage?: string;
  /** Extra validity check on the trimmed value (default: non-empty). */
  readonly isValid?: (value: string) => boolean;
}

/**
 * Which extra fields each role fills in, in display order, and which are required.
 * Single source of truth: the schema below validates from it and the signup form renders from it.
 */
export const SIGNUP_ROLE_FIELDS: Readonly<Record<UserRoleValue, readonly SignupRoleFieldRule[]>> = {
  SURGEON: [
    {
      field: "npi",
      requiredMessage: "10-digit NPI number is required for clinicians",
      isValid: (value) => value.length === 10,
    },
    { field: "licenseNumber", requiredMessage: "Medical license number is required" },
    { field: "specialty" },
  ],
  ANESTHESIOLOGIST: [
    {
      field: "npi",
      requiredMessage: "10-digit NPI number is required for clinicians",
      isValid: (value) => value.length === 10,
    },
    { field: "licenseNumber", requiredMessage: "Medical license number is required" },
    { field: "specialty" },
  ],
  NURSE: [
    { field: "licenseNumber", requiredMessage: "RN License number is required" },
    { field: "careStage", requiredMessage: "Primary care stage is required" },
  ],
  ADMIN: [{ field: "facilityCode", requiredMessage: "ASC Facility identifier is required" }],
  PATIENT: [
    { field: "dateOfBirth", requiredMessage: "Date of birth is required for patient portal setup" },
    { field: "escortName", requiredMessage: "Escort/Driver name is required for sedated procedures" },
    { field: "escortPhone", requiredMessage: "Escort contact phone number is required" },
  ],
};

export const signupSchema = z
  .object({
    role: userRoleSchema,
    fullName: z.string().min(2, "Full name is required"),
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    ...roleFieldShape,
  })
  .superRefine((data, ctx) => {
    for (const rule of SIGNUP_ROLE_FIELDS[data.role]) {
      if (rule.requiredMessage === undefined) continue;
      const value = (data[rule.field] ?? "").trim();
      const valid = value.length > 0 && (rule.isValid?.(value) ?? true);
      if (!valid) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: rule.requiredMessage, path: [rule.field] });
      }
    }
  });

export type SignupFormData = z.infer<typeof signupSchema>;
