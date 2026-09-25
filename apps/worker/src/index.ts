import { Worker } from "bullmq";
import { redisConnection } from "./redis.js";

const QUEUE_NAME = process.env["QUEUE_NAME"] ?? "default";

console.log(`Starting worker for queue: ${QUEUE_NAME}`);

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    console.log(`Processing job ${job.id} of type ${job.name}`);
    console.log("Job data:", JSON.stringify(job.data));

    // Job processing will be implemented here.
    // Each job type will have its own processor.
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("Worker error:", err);
});

async function shutdown() {
  console.log("Shutting down worker...");
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
