import { z } from "zod";

const FHIR_ID = /^[A-Za-z0-9._-]{1,64}$/;

export const hpOverrideRoleSchema = z.enum(["attending-physician", "medical-director"]);
export type HpOverrideRole = z.infer<typeof hpOverrideRoleSchema>;

export const hpUpdateNoteSchema = z.object({
  caseId: z.string().trim().regex(FHIR_ID, "Case ID must be a valid FHIR identifier"),
  facilityId: z.string().trim().regex(FHIR_ID, "Facility ID must be a valid FHIR identifier"),
  attestation: z
    .string()
    .trim()
    .min(10, "Attestation statement must be at least 10 characters")
    .max(2000, "Attestation statement cannot exceed 2000 characters"),
  noIntervalChange: z.literal(true, {
    errorMap: () => ({ message: "Physician must confirm no interval change" }),
  }),
  cardiovascularStatus: z.string().trim().min(1, "Cardiovascular status is required").max(300),
  pulmonaryStatus: z.string().trim().min(1, "Pulmonary status is required").max(300),
  airwayStatus: z.string().trim().max(300).optional(),
  signedAt: z.string().datetime().optional(),
  practitionerId: z.string().trim().regex(FHIR_ID, "Practitioner ID must be a valid FHIR identifier").optional(),
  practitionerName: z.string().trim().max(150).optional(),
});

export interface HpUpdateNoteInput {
  readonly caseId: string;
  readonly facilityId: string;
  readonly attestation: string;
  readonly noIntervalChange: true;
  readonly cardiovascularStatus: string;
  readonly pulmonaryStatus: string;
  readonly airwayStatus?: string;
  readonly signedAt?: string;
  readonly practitionerId?: string;
  readonly practitionerName?: string;
}

export const hpOverrideSchema = z.object({
  caseId: z.string().trim().regex(FHIR_ID, "Case ID must be a valid FHIR identifier"),
  facilityId: z.string().trim().regex(FHIR_ID, "Facility ID must be a valid FHIR identifier"),
  overrideReason: z
    .string()
    .trim()
    .min(10, "Clinical override reason must be at least 10 characters")
    .max(2000, "Clinical override reason cannot exceed 2000 characters"),
  role: hpOverrideRoleSchema,
  practitionerId: z.string().trim().regex(FHIR_ID, "Practitioner ID must be a valid FHIR identifier").optional(),
  practitionerName: z.string().trim().max(150).optional(),
  overriddenAt: z.string().datetime().optional(),
});

export interface HpOverrideInput {
  readonly caseId: string;
  readonly facilityId: string;
  readonly overrideReason: string;
  readonly role: HpOverrideRole;
  readonly practitionerId?: string;
  readonly practitionerName?: string;
  readonly overriddenAt?: string;
}
