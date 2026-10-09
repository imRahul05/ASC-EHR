import { z } from "zod";

/**
 * Background job contracts, shared by producers (apps/api) and apps/worker.
 *
 * Job data contract: IDENTIFIERS ONLY.
 *
 * Job data lives in Redis (and in the failed set for days), so it must never
 * carry PHI: no names, notes, transcripts, prompts or model output. Processors
 * load clinical data from the system of record by id, inside the worker.
 * `.strict()` rejects unknown keys, and ids are restricted to an id-like
 * alphabet so free text cannot be smuggled in through an id field.
 */
export const JOB_DATA_ID_PATTERN = /^[A-Za-z0-9._:/-]+$/;

export const jobDataIdSchema = z.string().min(1).max(128).regex(JOB_DATA_ID_PATTERN);

export const baseJobDataSchema = z
  .object({
    correlationId: jobDataIdSchema.optional(),
    /** Tenant the job runs for; the worker checks it is an active tenant before doing anything. */
    tenantId: jobDataIdSchema.optional(),
    /**
     * Facility (`Organization` id) the job runs at. The worker picks its Medplum client from this value only,
     * so Medplum's policy confines the job to that facility (#60); never from model output or other job fields.
     */
    facilityId: jobDataIdSchema.optional(),
    /** User who triggered the job, for audit (`actorId`); the worker re-checks their grant before each PHI step (#57). */
    actorId: jobDataIdSchema.optional(),
    patientId: jobDataIdSchema.optional(),
    surgicalCaseId: jobDataIdSchema.optional(),
  })
  .strict();

export type BaseJobData = z.infer<typeof baseJobDataSchema>;

/**
 * Contract for any job that reads or writes PHI (including AI agent runs): tenant and facility are required,
 * so the worker can never fall back to a client that is not scoped to one facility (#60).
 */
export const phiJobDataSchema = baseJobDataSchema.required({ tenantId: true, facilityId: true });

export type PhiJobData = z.infer<typeof phiJobDataSchema>;

/** Job names are static identifiers (they are stored in Redis and logged). */
export const jobNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/);
