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

export const patientInsuranceSchema = z.object({
  payerId: z.string().trim().min(1, "Payer ID is required").max(100),
  planName: z.string().trim().max(150).optional(),
  memberId: z.string().trim().min(1, "Member ID is required").max(100),
  groupNumber: z.string().trim().max(100).optional(),
  relationship: z.enum(["self", "spouse", "child", "other"]).optional(),
});

export const patientEscortSchema = z.object({
  name: z.string().trim().min(1, "Escort name is required").max(150),
  phone: z.string().trim().regex(PHONE, "Enter a valid phone number for escort"),
  relationship: z.string().trim().min(1, "Escort relationship is required").max(100),
});

export const registerPatientSchema = z.object({
  facilityId: z.string().trim().min(1, "Facility ID is required").optional(),
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
  mrn: z.string().trim().max(50).optional(),
  insurance: patientInsuranceSchema.optional(),
  escort: patientEscortSchema.optional(),
  confirmDuplicate: z.boolean().optional(),
});

export type PatientNameInput = z.infer<typeof patientNameSchema>;
export type PatientGenderInput = z.infer<typeof patientGenderSchema>;
export type PatientAddressInput = z.infer<typeof patientAddressSchema>;
export type PatientInsuranceInput = z.infer<typeof patientInsuranceSchema>;
export type PatientEscortInput = z.infer<typeof patientEscortSchema>;
export type RegisterPatientInput = z.infer<typeof registerPatientSchema>;
