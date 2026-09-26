import type { DefaultJobOptions, WorkerOptions } from "bullmq";
import type { WorkerEnv } from "@asc/config";

/**
 * Queue topology for AI work.
 *
 * Two queues so a background batch (e.g. re-coding a day of cases) can never
 * starve work a clinician is actively waiting on. Each queue has its own worker,
 * concurrency and rate limit.
 *
 * Producers (apps/api, later) enqueue with `QUEUE_DEFAULT_JOB_OPTIONS[queue]`.
 * TODO: move names + job options + the job data contract to a shared package
 * once apps/api starts enqueueing (apps must not import each other).
 */
export const QUEUE_NAMES = {
  /** A clinician is waiting on the result (drafts, summaries in the UI). */
  interactive: "ai-interactive",
  /** Nobody is waiting: batch, backfills, scheduled re-processing. */
  background: "ai-background",
} as const;

export type QueueKind = keyof typeof QUEUE_NAMES;
export type QueueName = (typeof QUEUE_NAMES)[QueueKind];

const MINUTE_MS = 60_000;
const HOUR_S = 60 * 60;
const DAY_S = 24 * HOUR_S;

/**
 * Keep finished jobs only as long as ops needs them, so job data/results do not
 * accumulate in Redis. Job data is ids only (see jobs.ts) and failedReason is
 * sanitized (see errors.ts), so the failed set holds no PHI either.
 * Eviction is best-effort: BullMQ evicts when the next job finishes.
 */
const REMOVE_ON_COMPLETE = { age: HOUR_S, count: 1_000 } as const;
const REMOVE_ON_FAIL = { age: 7 * DAY_S, count: 5_000 } as const;

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
    removeOnComplete: REMOVE_ON_COMPLETE,
    removeOnFail: REMOVE_ON_FAIL,
    stackTraceLimit: 5,
  },
  background: {
    // Rides out short provider outages / 429 windows: 15s, 30s.
    attempts: 3,
    backoff: { type: "exponential", delay: 15_000 },
    removeOnComplete: REMOVE_ON_COMPLETE,
    removeOnFail: REMOVE_ON_FAIL,
    stackTraceLimit: 5,
  },
} as const satisfies Record<QueueKind, DefaultJobOptions>;

/**
 * Lock / stall tuning. A job's lock is renewed every lockDuration/2 while the
 * worker is healthy; if a renewal is missed (event-loop stall, GC pause, Redis
 * blip) the job is declared "stalled" and handed to another worker, which
 * re-runs it from the start. For AI jobs that means a second model call (double
 * spend) and possibly a duplicate draft, while the first run may still finish.
 * Reasoning models can take minutes per call, so the locks are generous, and
 * interactive jobs are never re-run after a stall (maxStalledCount 0 -> failed):
 * by then the clinician has moved on and can simply retry.
 */
const LOCK_SETTINGS = {
  interactive: {
    lockDuration: 2 * MINUTE_MS,
    stalledInterval: MINUTE_MS,
    maxStalledCount: 0,
  },
  background: {
    lockDuration: 10 * MINUTE_MS,
    stalledInterval: 2 * MINUTE_MS,
    maxStalledCount: 1,
  },
} as const satisfies Record<QueueKind, Partial<WorkerOptions>>;

/** Worker options per queue, minus the connection (added by the caller). */
export function buildWorkerOptions(
  kind: QueueKind,
  env: WorkerEnv,
): Omit<WorkerOptions, "connection"> {
  const capacity =
    kind === "interactive"
      ? {
          concurrency: env.INTERACTIVE_CONCURRENCY,
          limiter: {
            max: env.INTERACTIVE_RATE_LIMIT_MAX,
            duration: env.INTERACTIVE_RATE_LIMIT_DURATION_MS,
          },
        }
      : {
          concurrency: env.BACKGROUND_CONCURRENCY,
          limiter: {
            max: env.BACKGROUND_RATE_LIMIT_MAX,
            duration: env.BACKGROUND_RATE_LIMIT_DURATION_MS,
          },
        };

  return {
    ...capacity,
    ...LOCK_SETTINGS[kind],
    // Safety net for producers that forget the defaults above.
    removeOnComplete: REMOVE_ON_COMPLETE,
    removeOnFail: REMOVE_ON_FAIL,
  };
}
