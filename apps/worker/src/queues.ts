import type { DefaultJobOptions, WorkerOptions } from "bullmq";
import type { QueueKind, WorkerEnv } from "@asc/config";
import {
  QUEUE_DEFAULT_JOB_OPTIONS,
  QUEUE_REMOVE_ON_COMPLETE,
  QUEUE_REMOVE_ON_FAIL,
} from "@asc/config";

/**
 * Worker-side queue settings. Queue names, producer job options and retention
 * are shared from @asc/config (queues.ts); the job data contract from
 * @asc/validation (jobs.ts).
 */

/**
 * Compile-time check that the shared producer options (typed structurally in
 * @asc/config, which does not depend on bullmq) stay assignable to BullMQ's.
 */
export const PRODUCER_JOB_OPTIONS: Readonly<Record<QueueKind, DefaultJobOptions>> =
  QUEUE_DEFAULT_JOB_OPTIONS;

const MINUTE_MS = 60_000;

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
    // Safety net for producers that forget QUEUE_DEFAULT_JOB_OPTIONS.
    removeOnComplete: QUEUE_REMOVE_ON_COMPLETE,
    removeOnFail: QUEUE_REMOVE_ON_FAIL,
  };
}
