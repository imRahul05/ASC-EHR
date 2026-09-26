import type { Job, Processor } from "bullmq";
import { RATE_LIMIT_ERROR, UnrecoverableError } from "bullmq";
import { logger } from "@asc/logger";

/**
 * BullMQ stores `err.message` as the job's `failedReason` and `err.stack` in its
 * stacktrace, in Redis. Provider/SDK errors can echo prompt text (PHI), so no
 * processor error reaches BullMQ as-is: it is replaced by a `SanitizedJobError`
 * built only from an error class name, a safe code and the job id.
 */
export class SanitizedJobError extends Error {
  readonly code: string;

  constructor(code: string, errorName: string, jobId: string | undefined) {
    super(`${code}: ${errorName} (job ${jobId ?? "unknown"})`);
    this.name = "SanitizedJobError";
    this.code = code;
  }
}

/** Job data failed its contract (`baseJobDataSchema` in @asc/validation). Never retried: it would fail again. */
export class InvalidJobDataError extends UnrecoverableError {
  readonly code = "INVALID_JOB_DATA";

  constructor() {
    // Constant message: validation issues can echo the rejected values.
    super("INVALID_JOB_DATA");
  }
}

/** Non-retryable variant; BullMQ matches it by `name`. */
class SanitizedUnrecoverableError extends SanitizedJobError {
  constructor(code: string, errorName: string, jobId: string | undefined) {
    super(code, errorName, jobId);
    this.name = "UnrecoverableError";
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9_]{1,64}$/;

/** BullMQ control-flow errors carry constant messages and must pass through. */
const CONTROL_FLOW_ERROR_NAMES = new Set(["DelayedError", "WaitingError", "WaitingChildrenError"]);

function safeIdentifier(value: unknown, fallback: string): string {
  return typeof value === "string" && SAFE_IDENTIFIER.test(value) ? value : fallback;
}

/** Error class name, if it looks like an identifier (never the message). */
export function safeErrorName(err: unknown): string {
  return err instanceof Error ? safeIdentifier(err.name, "Error") : "NonError";
}

function isUnrecoverable(err: unknown): boolean {
  return err instanceof UnrecoverableError || (err instanceof Error && err.name === "UnrecoverableError");
}

/** Maps an error to a PHI-free code; `err.code` is reused only if identifier-like. */
export function safeErrorCode(err: unknown): string {
  if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
    return "TIMEOUT";
  }
  const code = err instanceof Error ? (err as Error & { code?: unknown }).code : undefined;
  return safeIdentifier(code, isUnrecoverable(err) ? "UNRECOVERABLE" : "PROCESSOR_ERROR");
}

/** Builds the error BullMQ will persist; unrecoverable errors stay unrecoverable. */
export function sanitizeJobError(err: unknown, jobId: string | undefined): SanitizedJobError {
  const code = safeErrorCode(err);
  const name = safeErrorName(err);
  return isUnrecoverable(err)
    ? new SanitizedUnrecoverableError(code, name, jobId)
    : new SanitizedJobError(code, name, jobId);
}

function isControlFlowError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (CONTROL_FLOW_ERROR_NAMES.has(err.name) || err.message === RATE_LIMIT_ERROR)
  );
}

/**
 * Wraps a processor so every thrown error is sanitized before BullMQ sees it.
 * Logs only PHI-safe fields: never `err`, `err.message` or `err.cause`.
 */
export function withSanitizedErrors<TData, TResult>(
  queue: string,
  processor: (job: Job<TData, TResult>) => Promise<TResult>,
): Processor<TData, TResult> {
  return async (job) => {
    try {
      return await processor(job);
    } catch (err) {
      if (isControlFlowError(err)) throw err;
      const sanitized = sanitizeJobError(err, job.id);
      logger.error(
        {
          queue,
          jobId: job.id,
          jobName: job.name,
          attempt: job.attemptsMade + 1,
          errorName: safeErrorName(err),
          errorCode: sanitized.code,
        },
        "Job processor threw",
      );
      throw sanitized;
    }
  };
}
