import { z } from "zod";

// Book-case form (front desk / scheduler). Shared by apps/web and apps/api.
// `bookCasePayloadFrom` returns a plain object shaped like `BookCasePayload` in @asc/types.

export const procedureCodeSchema = z.enum(["COLONOSCOPY", "EGD", "EGD_COLONOSCOPY", "FLEX_SIG"]);
export const procedureIntentSchema = z.enum(["screening", "surveillance", "diagnostic"]);

/** Bookable case lengths in minutes (select options). */
export const CASE_DURATIONS_MIN = ["30", "45", "60", "90"] as const;

export const bookCaseSchema = z.object({
  patientId: z.string().min(1, "Choose a patient"),
  procedure: procedureCodeSchema,
  intent: procedureIntentSchema,
  indication: z.string().trim().min(3, "Add the indication").max(300),
  roomId: z.string().min(1, "Choose a room"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a start time"),
  durationMin: z.enum(CASE_DURATIONS_MIN),
  surgeonId: z.string().min(1, "Choose a gastroenterologist"),
  anesthesiaId: z.string().min(1, "Choose an anesthesia provider"),
  nurseId: z.string().min(1, "Choose a nurse"),
  referralId: z.string().optional(),
});

export type BookCaseFormData = z.infer<typeof bookCaseSchema>;

/** Local date + `HH:mm` → ISO instant (browser zone in the mock; facility zone in P05). */
export function localDateTimeToIso(date: string, time: string): string {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

/** Form values → `BookCasePayload` (@asc/types). */
export function bookCasePayloadFrom(data: BookCaseFormData) {
  return {
    patientId: data.patientId,
    procedure: data.procedure,
    intent: data.intent,
    indication: data.indication,
    roomId: data.roomId,
    scheduledStart: localDateTimeToIso(data.date, data.startTime),
    durationMin: Number(data.durationMin),
    surgeonId: data.surgeonId,
    anesthesiaId: data.anesthesiaId,
    nurseId: data.nurseId,
    referralId: data.referralId,
  };
}
