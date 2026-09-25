/**
 * Input for the discharge-instructions agent — the minimum necessary facts,
 * as closed enums / numbers / booleans. No names, DOB, MRN, addresses or free
 * text, and `.strict()` rejects any extra field, so identifiers cannot slip in.
 *
 * Lives here, not in @asc/validation: only the server (apps/api / apps/worker)
 * builds it from the procedure record, and keeping it beside `buildMessages`
 * keeps this agent's PHI boundary reviewable in one folder. The OUTPUT schema
 * is shared with the web app and lives in @asc/validation.
 */

import { patientLanguageSchema } from '@asc/validation';
import { z } from 'zod';

const procedureSchema = z.enum(['colonoscopy', 'egd', 'flexible-sigmoidoscopy']);

const sedationSchema = z.enum(['none', 'moderate', 'monitored-anesthesia-care', 'general']);

const findingsSchema = z
  .object({
    polypsRemoved: z.number().int().min(0).max(50),
    biopsiesTaken: z.boolean(),
    /** Bleeding control during the procedure (e.g. clips, cautery). */
    hemostasisPerformed: z.boolean(),
  })
  .strict();

/** Blood-thinner plan exactly as the clinician decided it; the agent never chooses one. */
const anticoagulantPlanSchema = z.discriminatedUnion('plan', [
  z.object({ plan: z.literal('not-taking') }).strict(),
  z.object({ plan: z.literal('resume-today') }).strict(),
  z.object({ plan: z.literal('resume-after-days'), days: z.number().int().min(1).max(14) }).strict(),
  z.object({ plan: z.literal('hold-until-contacted') }).strict(),
]);

const followUpSchema = z.enum([
  'as-needed',
  'clinic-2-weeks',
  'clinic-6-weeks',
  'repeat-procedure-1-year',
  'repeat-procedure-3-years',
  'repeat-procedure-5-years',
  'repeat-procedure-10-years',
]);

export const dischargeInstructionsInputSchema = z
  .object({
    procedures: z.array(procedureSchema).min(1).max(3),
    sedation: sedationSchema,
    findings: findingsSchema,
    anticoagulant: anticoagulantPlanSchema,
    followUp: followUpSchema,
    language: patientLanguageSchema,
    /** `basic` ≈ grade 5, `standard` ≈ grade 8. */
    readingLevel: z.enum(['basic', 'standard']),
  })
  .strict();

export type DischargeInstructionsInput = z.infer<typeof dischargeInstructionsInputSchema>;
