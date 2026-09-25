import { z } from "zod";

/**
 * Output of the `discharge-instructions` agent (@asc/agents): patient-facing
 * discharge instructions after a GI endoscopy. Shared because apps/api returns
 * it and apps/web renders it (and lets staff edit it before release).
 */

export const patientLanguageSchema = z.enum(["en", "es"]);
export type PatientLanguage = z.infer<typeof patientLanguageSchema>;

const lines = z.array(z.string().min(1)).min(1);

export const dischargeInstructionsOutputSchema = z.object({
  /** Language the instructions are written in. */
  language: patientLanguageSchema,
  /** Two or three plain-language sentences: what happened and how the patient is doing next. */
  summary: z.string().min(1),
  whatWasDone: lines,
  diet: lines,
  activity: lines,
  medications: z.array(
    z.object({
      action: z.enum(["resume", "hold", "continue"]),
      instruction: z.string().min(1),
    }),
  ),
  warningSigns: z.object({
    /** Call the clinic / on-call doctor. */
    callClinic: lines,
    /** Go to the emergency room or call 911. */
    goToEmergency: lines,
  }),
  followUp: z.string().min(1),
  pathologyPending: z.object({
    pending: z.boolean(),
    /** How the patient will get results; empty when nothing is pending. */
    message: z.string(),
  }),
});

export type DischargeInstructionsOutput = z.infer<typeof dischargeInstructionsOutputSchema>;
