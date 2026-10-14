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

/** 30-minute grace window for clock skew and immediate same-day add-on cases */
export const PAST_DATE_GRACE_MS = 30 * 60_000;

function isValidCalendarDate(dateStr: string): boolean {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return false;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!year || !month || !day) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

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
      if (Number.isNaN(time)) return false;
      const datePart = val.slice(0, 10);
      return isValidCalendarDate(datePart);
    }, "Scheduled date/time must be a valid calendar date and time")
    .refine((val) => {
      const time = Date.parse(val);
      return time > Date.now() - PAST_DATE_GRACE_MS;
    }, "Scheduled date/time cannot be in the past (more than 30 minutes ago)"),
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
  idempotencyKey: z
    .string()
    .trim()
    .min(1, "Idempotency key must not be empty")
    .max(128, "Idempotency key must not exceed 128 characters")
    .optional(),
  referralId: z
    .string()
    .trim()
    .regex(FHIR_ID, "Referral ID must be a valid FHIR identifier")
    .optional(),
});

export type BookCaseInput = z.infer<typeof bookCaseSchema>;
export type BookCaseFormInput = z.input<typeof bookCaseSchema>;

import {
  facilityDateTimeToIso,
  type DstDisambiguation,
  type FacilityDateTimeOptions,
} from "@asc/clinical-rules/time";

export {
  facilityDateTimeToIso,
  type DstDisambiguation,
  type FacilityDateTimeOptions,
};

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
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Select a valid calendar date (YYYY-MM-DD)")
      .refine(isValidCalendarDate, "Date must be a valid calendar date"),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Select a valid 24-hour start time (HH:MM)"),
    durationMinutes: z.coerce
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
    idempotencyKey: z
      .string()
      .trim()
      .min(1, "Idempotency key must not be empty")
      .max(128, "Idempotency key must not exceed 128 characters")
      .optional(),
    referralId: z
      .string()
      .trim()
      .regex(FHIR_ID, "Referral ID must be a valid FHIR identifier")
      .optional()
      .or(z.literal("")),
  })
  .refine(
    (data) => {
      try {
        const iso = facilityDateTimeToIso(data.date, data.startTime);
        const time = Date.parse(iso);
        return !Number.isNaN(time) && time > Date.now() - PAST_DATE_GRACE_MS;
      } catch {
        return false;
      }
    },
    {
      message: "Scheduled date and time cannot be in the past (more than 30 minutes ago)",
      path: ["startTime"],
    },
  );

export type BookCaseFormData = z.infer<typeof bookCaseFormSchema>;

export function bookCaseInputFrom(
  formData: BookCaseFormData,
  scheduledAtIso?: string,
): BookCaseInput {
  const scheduledAt =
    scheduledAtIso ?? facilityDateTimeToIso(formData.date, formData.startTime);
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
    idempotencyKey:
      formData.idempotencyKey && formData.idempotencyKey.trim().length > 0
        ? formData.idempotencyKey.trim()
        : undefined,
    referralId:
      formData.referralId && formData.referralId.trim().length > 0
        ? formData.referralId.trim()
        : undefined,
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

