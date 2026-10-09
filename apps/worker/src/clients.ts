import { env } from "./env.js";
import { createWorkerMedplum } from "./medplum.js";

/**
 * The process-wide worker Medplum clients, from the validated environment: one per facility (#60). Jobs that
 * read or write Medplum (P12 on) call `workerMedplum.clientForJob(job.data)`; nothing constructs a client itself.
 */
export const workerMedplum = createWorkerMedplum({ baseUrl: env.MEDPLUM_BASE_URL, clients: env.MEDPLUM_WORKER_CLIENTS });
