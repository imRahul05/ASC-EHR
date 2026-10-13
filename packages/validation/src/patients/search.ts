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

/**
 * Disambiguates a raw search term into DOB (YYYY-MM-DD), MRN, or patient name.
 * Scoped to an optional facility ID.
 */
export function buildSearchPayload(
  term: string,
  facilityId?: string | null,
): PatientSearchBodyInput {
  const trimmed = term.trim();
  const isDob = ISO_DATE.test(trimmed);
  const isMrn =
    /^(MRN-)?[A-Z0-9.-]+$/i.test(trimmed) &&
    !/\s/.test(trimmed) &&
    /[0-9]/.test(trimmed);

  if (isDob) {
    return { dob: trimmed, facilityId: facilityId ?? undefined };
  }
  if (isMrn) {
    return { mrn: trimmed, facilityId: facilityId ?? undefined };
  }
  return { name: trimmed, facilityId: facilityId ?? undefined };
}
