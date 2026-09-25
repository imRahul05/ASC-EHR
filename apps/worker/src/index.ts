import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { logger } from "@repo/logger";
import { shutdownTelemetry } from "@repo/telemetry";
import { env } from "./env.js";
import { redisConnection } from "./redis.js";

logger.info({ queue: env.QUEUE_NAME }, "Starting worker");

interface BaseJobData {
  correlationId?: string;
  // Patient and PHI data should NOT be here in full.
  // Pass IDs instead.
  patientId?: string;
  surgicalCaseId?: string;
}

function processJob(job: Job<BaseJobData>): Promise<void> {
  const jobLogger = logger.child({
    correlationId: job.data?.correlationId ?? job.id,
    jobId: job.id,
    jobName: job.name,
  });

  jobLogger.info("Processing job");

  // Job processing will be implemented here.
  // Each job type will have its own processor.
  // Example: fetch data from DB using job.data.patientId
  return Promise.resolve();
}

const worker = new Worker<BaseJobData>(env.QUEUE_NAME, processJob, {
  connection: redisConnection,
  concurrency: env.CONCURRENCY,
});

worker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Job completed");
});

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Job failed");
});

worker.on("error", (err) => {
  logger.error({ err }, "Worker error");
});

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down worker");
  try {
    await worker.close();
    await redisConnection.quit();
  } catch (err) {
    logger.error({ err }, "Error while closing worker");
  }
  const telemetryError = await shutdownTelemetry();
  if (telemetryError) {
    logger.error({ err: telemetryError }, "Telemetry shutdown failed");
  }
  process.exit(0);
}

process.once("SIGINT", (signal) => void shutdown(signal));
process.once("SIGTERM", (signal) => void shutdown(signal));
