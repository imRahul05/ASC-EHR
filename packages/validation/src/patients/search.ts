import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const patientSearchQuerySchema = z.object({
  mrn: z.string().trim().optional(),
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
  facilityId: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type PatientSearchQuery = z.infer<typeof patientSearchQuerySchema>;
