/**
 * Anesthesia Information Management System (AIMS) Schemas and Contracts.
 *
 * US Healthcare Regulations & Clinical Standards:
 * - CMS 42 CFR § 416.42(a) Condition for Coverage: Surgical and Anesthesia Services:
 *   Mandatory pre-anesthesia evaluation conducted immediately prior to surgery by a qualified practitioner.
 * - ASA Standards for Basic Anesthetic Monitoring (Amended October 2020):
 *   Basic anesthetic monitoring requires continuous evaluation of oxygenation (pulse oximetry),
 *   ventilation (continuous EtCO2 capnography from sedation start to end), and circulation (arterial blood pressure
 *   and heart rate at least every 5 minutes).
 * - ASA Physical Status Classification System (ASA I–V) & Mallampati Airway Classification (Class I–IV).
 * - DEA 21 CFR § 1304.22(c) & § 1304.11: Controlled substance administration and dual-witness disposal of
 *   wasted narcotics (e.g. fentanyl, midazolam).
 */

import { z } from "zod";
import {
  AIRWAY_DEVICES,
  AIRWAY_EVENT_TYPES,
  ANESTHESIA_DRUGS,
  ANESTHESIA_TECHNIQUES,
  DOSE_UNITS,
} from "@asc/types/clinical";

export const staffRefSchema = z.object({
  id: z.string().trim().min(1, "Staff ID is required"),
  name: z.string().trim().min(1, "Staff name is required"),
  initials: z.string().trim().min(1, "Staff initials are required"),
});

export const preAnesthesiaAssessmentSchema = z.object({
  asaClass: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  mallampati: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
  airwayNotes: z.string().trim().max(500, "Airway notes cannot exceed 500 characters").optional(),
  lastOralIntakeIso: z.string().datetime("Last oral intake must be a valid ISO datetime"),
  npoStatusSatisfied: z.boolean(),
  medicalDirectorCleared: z.boolean().optional(),
  assessedAt: z.string().datetime("Assessed at must be a valid ISO datetime").optional(),
  assessedBy: staffRefSchema.optional(),
});
export type PreAnesthesiaAssessmentInput = z.infer<typeof preAnesthesiaAssessmentSchema>;

export const anesthesiaDrugSchema = z.enum(ANESTHESIA_DRUGS);
export type AnesthesiaDrugInput = z.infer<typeof anesthesiaDrugSchema>;

export const doseUnitSchema = z.enum(DOSE_UNITS);
export type DoseUnitInput = z.infer<typeof doseUnitSchema>;

export const anesthesiaTechniqueSchema = z.enum(ANESTHESIA_TECHNIQUES);
export type AnesthesiaTechniqueInput = z.infer<typeof anesthesiaTechniqueSchema>;

export const airwayDeviceSchema = z.enum(AIRWAY_DEVICES);
export type AirwayDeviceInput = z.infer<typeof airwayDeviceSchema>;

export const airwayEventTypeSchema = z.enum(AIRWAY_EVENT_TYPES);
export type AirwayEventTypeInput = z.infer<typeof airwayEventTypeSchema>;

export const controlledSubstanceWasteSchema = z.object({
  drug: anesthesiaDrugSchema,
  administeredAmount: z.number().positive("Administered amount must be positive"),
  wastedAmount: z.number().nonnegative("Wasted amount must be non-negative"),
  unit: doseUnitSchema,
  witnessedBy: staffRefSchema,
  witnessedAt: z.string().datetime("Witnessed at must be a valid ISO datetime"),
  reason: z.string().trim().max(500, "Reason cannot exceed 500 characters").optional(),
});
export type ControlledSubstanceWasteInput = z.infer<typeof controlledSubstanceWasteSchema>;

export const aimsVitalsPayloadSchema = z.object({
  context: z.enum(["pre", "intra", "post"]).default("intra"),
  hr: z
    .number()
    .min(20, "Heart rate must be between 20 and 250 bpm")
    .max(250, "Heart rate must be between 20 and 250 bpm"),
  sbp: z
    .number()
    .min(40, "Systolic BP must be between 40 and 300 mmHg")
    .max(300, "Systolic BP must be between 40 and 300 mmHg"),
  dbp: z
    .number()
    .min(20, "Diastolic BP must be between 20 and 200 mmHg")
    .max(200, "Diastolic BP must be between 20 and 200 mmHg"),
  spo2: z
    .number()
    .min(50, "SpO2 must be between 50% and 100%")
    .max(100, "SpO2 cannot exceed 100%"),
  rr: z
    .number()
    .min(4, "Respiratory rate must be between 4 and 60 breaths/min")
    .max(60, "Respiratory rate must be between 4 and 60 breaths/min"),
  etco2: z
    .number()
    .min(0, "EtCO2 must be between 0 and 100 mmHg")
    .max(100, "EtCO2 cannot exceed 100 mmHg")
    .optional(),
  tempC: z
    .number()
    .min(30, "Temperature must be between 30 and 45°C")
    .max(45, "Temperature must be between 30 and 45°C")
    .optional(),
  pain: z.number().min(0).max(10).optional(),
  recordedAt: z.string().datetime("Recorded at must be a valid ISO datetime").optional(),
});
export type AimsVitalsPayloadInput = z.infer<typeof aimsVitalsPayloadSchema>;

export const anesthesiaDoseEntrySchema = z.object({
  kind: z.literal("dose"),
  drug: anesthesiaDrugSchema,
  amount: z.number().positive("Dose amount must be greater than 0"),
  unit: doseUnitSchema,
  at: z.string().datetime("Dose timestamp must be a valid ISO datetime").optional(),
  waste: controlledSubstanceWasteSchema.optional(),
});
export type AnesthesiaDoseEntryInput = z.infer<typeof anesthesiaDoseEntrySchema>;

export const anesthesiaVitalsEntrySchema = z.object({
  kind: z.literal("vitals"),
  vitals: aimsVitalsPayloadSchema,
});
export type AnesthesiaVitalsEntryInput = z.infer<typeof anesthesiaVitalsEntrySchema>;

export const anesthesiaAirwayEventEntrySchema = z.object({
  kind: z.literal("airway_event"),
  type: airwayEventTypeSchema,
  note: z.string().trim().max(500, "Note cannot exceed 500 characters").optional(),
  at: z.string().datetime("Airway event timestamp must be a valid ISO datetime").optional(),
});
export type AnesthesiaAirwayEventEntryInput = z.infer<typeof anesthesiaAirwayEventEntrySchema>;

export const anesthesiaSedationEntrySchema = z.object({
  kind: z.literal("sedation"),
  edge: z.enum(["start", "end"]),
  at: z.string().datetime("Sedation timestamp must be a valid ISO datetime").optional(),
});
export type AnesthesiaSedationEntryInput = z.infer<typeof anesthesiaSedationEntrySchema>;

export const anesthesiaSetupEntrySchema = z.object({
  kind: z.literal("setup"),
  technique: anesthesiaTechniqueSchema.optional(),
  device: airwayDeviceSchema.optional(),
  o2Lpm: z
    .number()
    .min(0, "O2 flow must be between 0 and 15 L/min")
    .max(15, "O2 flow must be between 0 and 15 L/min")
    .optional(),
});
export type AnesthesiaSetupEntryInput = z.infer<typeof anesthesiaSetupEntrySchema>;

const baseAnesthesiaEntrySchema = z.discriminatedUnion("kind", [
  anesthesiaDoseEntrySchema,
  anesthesiaVitalsEntrySchema,
  anesthesiaAirwayEventEntrySchema,
  anesthesiaSedationEntrySchema,
  anesthesiaSetupEntrySchema,
]);

export const anesthesiaEntrySchema = baseAnesthesiaEntrySchema.superRefine((val, ctx) => {
  if (val.kind === "dose" && val.waste) {
    if (val.waste.drug !== val.drug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Wasted drug must match the administered drug",
        path: ["waste", "drug"],
      });
    }
    if (val.waste.unit !== val.unit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Wasted dose unit must match the administered dose unit",
        path: ["waste", "unit"],
      });
    }
    if (val.waste.administeredAmount !== val.amount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Wasted administered amount must match the dose amount",
        path: ["waste", "administeredAmount"],
      });
    }
  }
});
export type AnesthesiaEntryInput = z.infer<typeof anesthesiaEntrySchema>;

export const aimsBatchEntrySchema = z.object({
  clientId: z.string().uuid("Client ID must be a valid UUID"),
  caseId: z.string().optional(),
  facilityId: z.string().optional(),
  userId: z.string().optional(),
  payload: anesthesiaEntrySchema,
  recordedAt: z.string().datetime("Recorded at must be a valid ISO datetime"),
});
export type AimsBatchEntryInput = z.infer<typeof aimsBatchEntrySchema>;

export const aimsBatchSchema = z.object({
  entries: z
    .array(aimsBatchEntrySchema)
    .min(1, "Batch must contain at least 1 entry")
    .max(200, "Batch cannot exceed 200 entries"),
});
export type AimsBatchInput = z.infer<typeof aimsBatchSchema>;
