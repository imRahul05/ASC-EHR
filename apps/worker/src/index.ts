import { Worker, Job } from "bullmq";
import { redisConnection } from "./redis.js";
import { logger } from "@repo/logger";

const QUEUE_NAME = process.env["QUEUE_NAME"] ?? "default";

logger.info(`Starting worker for queue: ${QUEUE_NAME}`);

interface BaseJobData {
  correlationId?: string;
  // Patient and PHI data should NOT be here in full.
  // Pass IDs instead.
  patientId?: string;
  surgicalCaseId?: string;
}

const worker = new Worker(
  QUEUE_NAME,
  async (job: Job<BaseJobData>) => {
    const jobLogger = logger.child({ 
      correlationId: job.data?.correlationId ?? job.id,
      jobId: job.id, 
      jobName: job.name 
    });
    
    jobLogger.info("Processing job");

    // Job processing will be implemented here.
    // Each job type will have its own processor.
    // Example: fetch data from DB using job.data.patientId
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

worker.on("completed", (job) => {
  logger.info({ jobId: job.id }, `Job completed`);
});

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, `Job failed: ${err.message}`);
});

worker.on("error", (err) => {
  logger.error({ err }, "Worker error");
});

async function shutdown() {
  logger.info("Shutting down worker...");
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
