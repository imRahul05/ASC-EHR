import { z } from "zod";

const INSTANT_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const FHIR_ID = /^[A-Za-z0-9.-]{1,64}$/;

export const procedureIntentSchema = z.enum([
  "screening",
  "surveillance",
  "diagnostic",
  "therapeutic",
]);

export type ProcedureIntentInput = z.infer<typeof procedureIntentSchema>;

export const bookCaseSchema = z.object({
  facilityId: z
    .string()
    .trim()
    .regex(FHIR_ID, "Facility ID must be a valid FHIR identifier (1-64 alphanumeric characters, dots or hyphens)"),
  patientId: z
    .string()
    .trim()
    .regex(FHIR_ID, "Patient ID must be a valid FHIR identifier (1-64 alphanumeric characters, dots or hyphens)"),
  roomId: z
    .string()
    .trim()
    .regex(
      FHIR_ID,
      "Room ID must be a valid FHIR identifier (1-64 alphanumeric characters, dots or hyphens)",
    ),
  scheduledAt: z
    .string()
    .trim()
    .regex(INSTANT_REGEX, "Scheduled date/time must be an ISO 8601 instant with timezone (e.g. 2026-10-14T09:00:00Z)")
    .refine((val) => {
      const time = Date.parse(val);
      return !Number.isNaN(time);
    }, "Scheduled date/time must be a valid calendar date and time")
    .refine((val) => {
      const time = Date.parse(val);
      return time > Date.now();
    }, "Scheduled date/time must be a future date and time"),
  durationMinutes: z
    .number()
    .int("Duration must be an integer")
    .min(15, "Duration must be at least 15 minutes")
    .max(240, "Duration cannot exceed 240 minutes")
    .default(45),
  primaryPhysicianId: z
    .string()
    .trim()
    .regex(FHIR_ID, "Primary physician ID must be a valid FHIR identifier"),
  anesthesiologistId: z
    .string()
    .trim()
    .regex(FHIR_ID, "Anesthesiologist ID must be a valid FHIR identifier")
    .optional(),
  procedureIntent: procedureIntentSchema,
  primaryProcedureCode: z
    .string()
    .trim()
    .min(1, "Primary procedure code is required")
    .max(32, "Primary procedure code must not exceed 32 characters"),
  secondaryProcedureCodes: z
    .array(z.string().trim().min(1, "Procedure code cannot be blank").max(32))
    .optional(),
  notes: z
    .string()
    .trim()
    .max(500, "Notes cannot exceed 500 characters")
    .transform((v) => (v.length > 0 ? v : undefined))
    .optional(),
});

export type BookCaseInput = z.infer<typeof bookCaseSchema>;
export type BookCaseFormInput = z.input<typeof bookCaseSchema>;

export const bookCaseFormSchema = z
  .object({
    facilityId: z
      .string()
      .trim()
      .regex(FHIR_ID, "Facility ID must be a valid FHIR identifier"),
    patientId: z
      .string()
      .trim()
      .regex(FHIR_ID, "Patient ID must be a valid FHIR identifier"),
    roomId: z
      .string()
      .trim()
      .regex(FHIR_ID, "Room ID must be a valid FHIR identifier"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Select a valid calendar date"),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Select a valid 24-hour start time (HH:MM)"),
    durationMinutes: z
      .number()
      .int("Duration must be an integer")
      .min(15, "Duration must be at least 15 minutes")
      .max(240, "Duration cannot exceed 240 minutes")
      .default(45),
    primaryPhysicianId: z
      .string()
      .trim()
      .regex(FHIR_ID, "Primary physician ID must be a valid FHIR identifier"),
    anesthesiologistId: z
      .string()
      .trim()
      .regex(FHIR_ID, "Anesthesiologist ID must be a valid FHIR identifier")
      .optional()
      .or(z.literal("")),
    procedureIntent: procedureIntentSchema,
    primaryProcedureCode: z
      .string()
      .trim()
      .min(1, "Primary procedure CPT code is required")
      .max(32, "Primary procedure code must not exceed 32 characters"),
    secondaryProcedureCodes: z
      .array(z.string().trim().min(1, "Procedure code cannot be blank").max(32))
      .optional(),
    notes: z
      .string()
      .trim()
      .max(500, "Notes cannot exceed 500 characters")
      .optional(),
  })
  .refine(
    (data) => {
      const time = Date.parse(`${data.date}T${data.startTime}:00`);
      return !Number.isNaN(time) && time > Date.now();
    },
    {
      message: "Scheduled date and time must be a future date and time",
      path: ["startTime"],
    },
  );

export type BookCaseFormData = z.infer<typeof bookCaseFormSchema>;

export function bookCaseInputFrom(formData: BookCaseFormData): BookCaseInput {
  const scheduledAt = new Date(`${formData.date}T${formData.startTime}:00`).toISOString();
  return {
    facilityId: formData.facilityId.trim(),
    patientId: formData.patientId.trim(),
    roomId: formData.roomId.trim(),
    scheduledAt,
    durationMinutes: formData.durationMinutes,
    primaryPhysicianId: formData.primaryPhysicianId.trim(),
    anesthesiologistId:
      formData.anesthesiologistId && formData.anesthesiologistId.trim().length > 0
        ? formData.anesthesiologistId.trim()
        : undefined,
    procedureIntent: formData.procedureIntent,
    primaryProcedureCode: formData.primaryProcedureCode.trim(),
    secondaryProcedureCodes: formData.secondaryProcedureCodes,
    notes: formData.notes && formData.notes.trim().length > 0 ? formData.notes.trim() : undefined,
  };
}

export const bookCaseResultSchema = z.object({
  caseId: z.string().min(1),
  appointmentId: z.string().min(1),
  encounterId: z.string().min(1),
  scheduledAt: z.string().min(1),
  roomId: z.string().min(1),
});

export interface BookCaseResult {
  readonly caseId: string;
  readonly appointmentId: string;
  readonly encounterId: string;
  readonly scheduledAt: string;
  readonly roomId: string;
}

