/**
 * Queue topology for AI work, shared by producers (apps/api) and apps/worker.
 *
 * Two queues so a background batch (e.g. re-coding a day of cases) can never
 * starve work a clinician is actively waiting on. Each queue has its own worker,
 * concurrency and rate limit (worker-side settings live in apps/worker).
 *
 * Producers enqueue with `QUEUE_DEFAULT_JOB_OPTIONS[queue]`.
 */
export const QUEUE_NAMES = {
  /** A clinician is waiting on the result (drafts, summaries in the UI). */
  interactive: "ai-interactive",
  /** Nobody is waiting: batch, backfills, scheduled re-processing. */
  background: "ai-background",
} as const;

export type QueueKind = keyof typeof QUEUE_NAMES;
export type QueueName = (typeof QUEUE_NAMES)[QueueKind];

/**
 * Minimal structural subset of BullMQ's `KeepJobs` / `DefaultJobOptions`, so
 * this package stays free of a bullmq dependency. Values typed with these are
 * assignable to BullMQ's types (apps/worker checks this at compile time).
 */
export interface QueueKeepJobs {
  /** Maximum age in seconds for a finished job to be kept. */
  age?: number;
  /** Maximum number of finished jobs to keep. */
  count?: number;
}

export interface QueueJobOptions {
  attempts?: number;
  backoff?: number | { type: "fixed" | "exponential"; delay?: number };
  removeOnComplete?: boolean | number | QueueKeepJobs;
  removeOnFail?: boolean | number | QueueKeepJobs;
  stackTraceLimit?: number;
}

const HOUR_S = 60 * 60;
const DAY_S = 24 * HOUR_S;

/**
 * Keep finished jobs only as long as ops needs them, so job data/results do not
 * accumulate in Redis. Job data is ids only (`baseJobDataSchema` in
 * @asc/validation) and failedReason is sanitized by the worker, so the failed
 * set holds no PHI either. Eviction is best-effort: BullMQ evicts when the next
 * job finishes.
 */
export const QUEUE_REMOVE_ON_COMPLETE = {
  age: HOUR_S,
  count: 1_000,
} as const satisfies QueueKeepJobs;
export const QUEUE_REMOVE_ON_FAIL = {
  age: 7 * DAY_S,
  count: 5_000,
} as const satisfies QueueKeepJobs;

/**
 * Default options for producers. Retries re-run model calls (new spend, and
 * possibly a duplicate draft until execution records/idempotency exist), so
 * attempts stay low; the agents gateway already falls back across models.
 */
export const QUEUE_DEFAULT_JOB_OPTIONS = {
  interactive: {
    // The clinician is waiting: one retry, fast backoff, then fail visibly.
    attempts: 2,
    backoff: { type: "exponential", delay: 2_000 },
    removeOnComplete: QUEUE_REMOVE_ON_COMPLETE,
    removeOnFail: QUEUE_REMOVE_ON_FAIL,
    stackTraceLimit: 5,
  },
  background: {
    // Rides out short provider outages / 429 windows: 15s, 30s.
    attempts: 3,
    backoff: { type: "exponential", delay: 15_000 },
    removeOnComplete: QUEUE_REMOVE_ON_COMPLETE,
    removeOnFail: QUEUE_REMOVE_ON_FAIL,
    stackTraceLimit: 5,
  },
} as const satisfies Record<QueueKind, QueueJobOptions>;
