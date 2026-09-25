import type { WorkerEnv } from "@repo/config";
import { parseEnv, workerEnvSchema } from "@repo/config";
import { logger } from "@repo/logger";

function loadEnv(): WorkerEnv {
  try {
    return parseEnv(workerEnvSchema);
  } catch (err) {
    // EnvValidationError lists variable names only, never values.
    logger.fatal({ err }, "Worker failed to start");
    process.exit(1);
  }
}

/** Validated worker environment, parsed once at startup. */
export const env = loadEnv();
