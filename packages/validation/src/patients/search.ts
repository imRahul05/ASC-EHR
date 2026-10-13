import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FHIR_ID = /^[A-Za-z0-9.-]{1,64}$/;
const MRN_REGEX = /^[^\s\p{Cc}]{1,64}$/u;

export const patientSearchQuerySchema = z.object({
  mrn: z
    .string()
    .trim()
    .regex(MRN_REGEX, "MRN must not contain whitespace or control characters and be max 64 characters")
    .optional(),
  name: z.string().trim().optional(),
  dob: z
    .string()
    .trim()
    .regex(ISO_DATE, "Date of birth must be YYYY-MM-DD")
    .optional(),
  birthdate: z
    .string()
    .trim()
    .regex(ISO_DATE, "Date of birth must be YYYY-MM-DD")
    .optional(),
  facilityId: z
    .string()
    .trim()
    .regex(FHIR_ID, "Facility ID must be a valid FHIR identifier (1-64 alphanumeric characters, dots or hyphens)")
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const patientSearchSchema = patientSearchQuerySchema;
export const patientSearchBodySchema = patientSearchQuerySchema;

export type PatientSearchQuery = z.infer<typeof patientSearchQuerySchema>;
export type PatientSearchInput = z.input<typeof patientSearchSchema>;
export type PatientSearchBodyInput = z.input<typeof patientSearchBodySchema>;
