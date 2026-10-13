import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PHONE = /^[+()\d\s.-]{7,20}$/;

export const patientNameSchema = z.object({
  family: z.string().trim().min(1, "Family name is required").max(100),
  given: z.union([
    z.string().trim().min(1).max(100).transform((val) => [val]),
    z.array(z.string().trim().min(1).max(100)).min(1, "At least one given name is required"),
  ]),
});

export const patientGenderSchema = z.enum(["male", "female", "other", "unknown"]);

export const patientAddressSchema = z.object({
  line: z.array(z.string().trim().max(150)).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(50).optional(),
  postalCode: z.string().trim().max(20).optional(),
  country: z.string().trim().max(50).optional(),
});

import { patientInsuranceSchema } from "@asc/validation/patients/coverage";

export const patientEscortSchema = z.object({
  name: z.string().trim().min(1, "Escort name is required").max(150),
  phone: z.string().trim().regex(PHONE, "Enter a valid phone number for escort"),
  relationship: z.string().trim().min(1, "Escort relationship is required").max(100),
});

const FHIR_ID = /^[A-Za-z0-9.-]{1,64}$/;
const MRN_REGEX = /^[^\s\p{Cc}]{1,64}$/u;

export const registerPatientSchema = z.object({
  facilityId: z
    .string()
    .trim()
    .regex(FHIR_ID, "Facility ID must be a valid FHIR identifier (1-64 alphanumeric characters, dots or hyphens)")
    .optional(),
  name: patientNameSchema,
  dateOfBirth: z
    .string()
    .regex(ISO_DATE, "Date of birth must be YYYY-MM-DD")
    .refine((val) => {
      const time = Date.parse(`${val}T00:00:00Z`);
      return !Number.isNaN(time) && time < Date.now();
    }, "Date of birth must be a valid past date"),
  gender: patientGenderSchema,
  phone: z.string().trim().regex(PHONE, "Enter a reachable phone number"),
  email: z.string().trim().email("Enter a valid email address").optional().or(z.literal("")),
  address: patientAddressSchema.optional(),
  mrn: z
    .string()
    .trim()
    .regex(MRN_REGEX, "MRN must not contain whitespace or control characters and be max 64 characters")
    .optional(),
  insurance: patientInsuranceSchema.optional(),
  escort: patientEscortSchema.optional(),
  confirmDuplicate: z.boolean().optional(),
  retry: z.boolean().optional(),
});

export type PatientNameInput = z.infer<typeof patientNameSchema>;
export type PatientGenderInput = z.infer<typeof patientGenderSchema>;
export type PatientAddressInput = z.infer<typeof patientAddressSchema>;
export type PatientEscortInput = z.infer<typeof patientEscortSchema>;
export type RegisterPatientInput = z.infer<typeof registerPatientSchema>;
export type RegisterPatientFormInput = z.input<typeof registerPatientSchema>;
