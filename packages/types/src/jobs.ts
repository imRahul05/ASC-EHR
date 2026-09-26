/**
 * Job return values are stored in Redis like job data: status and ids only,
 * never generated text. Results belong in the system of record.
 * (The job data contract is a Zod schema: `baseJobDataSchema` in @asc/validation.)
 */
export interface JobResult {
  status: "completed";
  /** Ids of records the job created/updated, e.g. `{ documentId: "..." }`. */
  resourceIds?: Record<string, string>;
}
