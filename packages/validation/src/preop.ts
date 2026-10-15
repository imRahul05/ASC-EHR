import { z } from "zod";

const FHIR_ID = /^[A-Za-z0-9.-]{1,64}$/;
const PHONE = /^[+()\d\s.-]{7,20}$/;

export const ivSiteSchema = z.enum([
  "left_hand",
  "right_hand",
  "left_forearm",
  "right_forearm",
  "left_ac",
  "right_ac",
]);
export type IvSite = z.infer<typeof ivSiteSchema>;

export const ivGaugeSchema = z.union([z.literal(18), z.literal(20), z.literal(22)]);
export type IvGauge = z.infer<typeof ivGaugeSchema>;

export const preopVitalsSchema = z.object({
  sbp: z
    .number()
    .min(50, "Systolic BP must be between 50 and 300 mmHg")
    .max(300, "Systolic BP must be between 50 and 300 mmHg"),
  dbp: z
    .number()
    .min(30, "Diastolic BP must be between 30 and 200 mmHg")
    .max(200, "Diastolic BP must be between 30 and 200 mmHg"),
  hr: z
    .number()
    .min(30, "Heart rate must be between 30 and 250 bpm")
    .max(250, "Heart rate must be between 30 and 250 bpm"),
  rr: z
    .number()
    .min(6, "Respiratory rate must be between 6 and 60 breaths/min")
    .max(60, "Respiratory rate must be between 6 and 60 breaths/min"),
  spo2: z
    .number()
    .min(50, "SpO2 must be between 50% and 100%")
    .max(100, "SpO2 cannot exceed 100%"),
  tempC: z
    .number()
    .min(30, "Temperature must be between 30 and 45°C")
    .max(45, "Temperature must be between 30 and 45°C"),
  heightInches: z.number().min(10).max(100).optional(),
  weightLbs: z.number().min(10).max(800).optional(),
});

export const preopIvSchema = z.object({
  site: ivSiteSchema,
  gauge: ivGaugeSchema,
  attempts: z.number().int().min(1, "IV attempts must be at least 1").max(10),
});

export const preopNpoSchema = z.object({
  solidFoodHoursAgo: z.number().min(0, "Solid food hours must be non-negative").max(168),
  clearLiquidsHoursAgo: z.number().min(0, "Clear liquids hours must be non-negative").max(168),
  confirmed: z.boolean(),
});

export const preopEscortSchema = z.object({
  name: z.string().trim().min(1, "Escort name is required").max(150),
  phone: z
    .string()
    .trim()
    .regex(PHONE, "Enter a valid phone number for escort")
    .refine((val) => (val.match(/\d/g) ?? []).length >= 7, "Phone number must contain at least 7 digits"),
  relationship: z.string().trim().min(1, "Escort relationship is required").max(100),
  confirmedPresent: z.boolean(),
});

export const preopAssessmentSchema = z.object({
  caseId: z
    .string()
    .trim()
    .regex(FHIR_ID, "Case ID must be a valid FHIR identifier"),
  facilityId: z
    .string()
    .trim()
    .regex(FHIR_ID, "Facility ID must be a valid FHIR identifier"),
  vitals: preopVitalsSchema,
  iv: preopIvSchema,
  npo: preopNpoSchema,
  escort: preopEscortSchema,
  allergiesReviewed: z.literal(true, {
    errorMap: () => ({ message: "Allergies review is required" }),
  }),
  belongingsSecured: z.boolean(),
});

export interface PreopAssessmentInput {
  readonly caseId: string;
  readonly facilityId: string;
  readonly vitals: {
    readonly sbp: number;
    readonly dbp: number;
    readonly hr: number;
    readonly rr: number;
    readonly spo2: number;
    readonly tempC: number;
    readonly heightInches?: number;
    readonly weightLbs?: number;
  };
  readonly iv: {
    readonly site: "left_hand" | "right_hand" | "left_forearm" | "right_forearm" | "left_ac" | "right_ac";
    readonly gauge: 18 | 20 | 22;
    readonly attempts: number;
  };
  readonly npo: {
    readonly solidFoodHoursAgo: number;
    readonly clearLiquidsHoursAgo: number;
    readonly confirmed: boolean;
  };
  readonly escort: {
    readonly name: string;
    readonly phone: string;
    readonly relationship: string;
    readonly confirmedPresent: boolean;
  };
  readonly allergiesReviewed: true;
  readonly belongingsSecured: boolean;
}
