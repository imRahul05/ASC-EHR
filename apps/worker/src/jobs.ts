import { z } from "zod";

/**
 * Job data contract: IDENTIFIERS ONLY.
 *
 * Job data lives in Redis (and in the failed set for days), so it must never
 * carry PHI: no names, notes, transcripts, prompts or model output. Processors
 * load clinical data from the system of record by id, inside the worker.
 * `.strict()` rejects unknown keys, and ids are restricted to an id-like
 * alphabet so free text cannot be smuggled in through an id field.
 */
const idSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:/-]+$/);

export const baseJobDataSchema = z
  .object({
    correlationId: idSchema.optional(),
    /** User who triggered the job, for audit (`actorId`). */
    actorId: idSchema.optional(),
    patientId: idSchema.optional(),
    surgicalCaseId: idSchema.optional(),
  })
  .strict();

export type BaseJobData = z.infer<typeof baseJobDataSchema>;

/**
 * Job return values are stored in Redis like job data: status and ids only,
 * never generated text. Results belong in the system of record.
 */
export interface JobResult {
  status: "completed";
  /** Ids of records the job created/updated, e.g. `{ documentId: "..." }`. */
  resourceIds?: Record<string, string>;
}

/** Job names are static identifiers (they are stored in Redis and logged). */
export const jobNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/);
