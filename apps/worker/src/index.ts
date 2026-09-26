import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { logger } from "@asc/logger";
import { shutdownTelemetry } from "@asc/telemetry";
import type { QueueKind } from "@asc/config";
import { QUEUE_NAMES } from "@asc/config";
import type { JobResult } from "@asc/types";
import type { BaseJobData } from "@asc/validation";
import { baseJobDataSchema, jobNameSchema } from "@asc/validation";
import { env } from "./env.js";
import { InvalidJobDataError, withSanitizedErrors } from "./errors.js";
import { buildWorkerOptions } from "./queues.js";
import { redisConnection } from "./redis.js";

function processJob(job: Job<BaseJobData, JobResult>): Promise<JobResult> {
  // Enforce the ids-only contract before touching anything else.
  const data = baseJobDataSchema.safeParse(job.data);
  if (!data.success || !jobNameSchema.safeParse(job.name).success) {
    throw new InvalidJobDataError();
  }

  const jobLogger = logger.child({
    correlationId: data.data.correlationId ?? job.id,
    jobId: job.id,
    jobName: job.name,
  });

  jobLogger.info("Processing job");

  // Job processing will be implemented here.
  // Each job type will have its own processor.
  // Example: fetch data from DB using data.data.patientId
  return Promise.resolve({ status: "completed" });
}

function startWorker(kind: QueueKind): Worker<BaseJobData, JobResult> {
  const queue = QUEUE_NAMES[kind];
  const options = buildWorkerOptions(kind, env);
  logger.info(
    { queue, concurrency: options.concurrency, limiter: options.limiter },
    "Starting worker",
  );

  const worker = new Worker<BaseJobData, JobResult>(
    queue,
    withSanitizedErrors(queue, processJob),
    { ...options, connection: redisConnection },
  );

  worker.on("completed", (job) => {
    logger.info({ queue, jobId: job.id }, "Job completed");
  });

  // `err` here is already sanitized (see errors.ts); log its safe message only.
  worker.on("failed", (job, err) => {
    logger.error(
      { queue, jobId: job?.id, attemptsMade: job?.attemptsMade, failedReason: err.message },
      "Job failed",
    );
  });

  worker.on("error", (err) => {
    logger.error({ queue, err }, "Worker error");
  });

  return worker;
}

const workers = [startWorker("interactive"), startWorker("background")];

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down workers");
  try {
    // close() stops fetching and waits for in-flight jobs to finish.
    await Promise.all(workers.map((worker) => worker.close()));
    await redisConnection.quit();
  } catch (err) {
    logger.error({ err }, "Error while closing workers");
  }
  const telemetryError = await shutdownTelemetry();
  if (telemetryError) {
    logger.error({ err: telemetryError }, "Telemetry shutdown failed");
  }
  process.exit(0);
}

process.once("SIGINT", (signal) => void shutdown(signal));
process.once("SIGTERM", (signal) => void shutdown(signal));
