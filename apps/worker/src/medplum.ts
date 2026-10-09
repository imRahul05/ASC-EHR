import type { MedplumWorkerClients } from "@asc/config";
import { createClientCredentialsClient, type MedplumClient } from "@asc/api-client/server";
import type { PhiJobData } from "@asc/validation";
import { phiJobDataSchema } from "@asc/validation";

/**
 * The worker's Medplum clients: ONE per facility (#60). A job's client is chosen from its validated `facilityId`
 * only (never from model output or any other field), and that client's membership binds the policy's `%facility`
 * to the facility, so Medplum itself confines the job, and any AI agent tool it runs, to that facility.
 * There is no fallback to a tenant-wide client: an unknown facility is an error.
 */
export class WorkerMedplumError extends Error {
  constructor(message: "Medplum is not configured" | "no worker client for this facility" | "invalid PHI job data") {
    super(message);
    this.name = "WorkerMedplumError";
  }
}

type Connect = typeof createClientCredentialsClient;

export function createWorkerMedplum(
  config: { readonly baseUrl: string | undefined; readonly clients: MedplumWorkerClients | undefined },
  connect: Connect = createClientCredentialsClient,
) {
  const signedIn = new Map<string, Promise<MedplumClient>>();

  /** The client confined to one facility; signed in once per process, Medplum renews its token. */
  function createFacilityWorkerClient(facilityId: string): Promise<MedplumClient> {
    const { baseUrl, clients } = config;
    if (baseUrl === undefined || clients === undefined) return Promise.reject(new WorkerMedplumError("Medplum is not configured"));
    const credentials = Object.hasOwn(clients, facilityId) ? clients[facilityId] : undefined;
    if (credentials === undefined) return Promise.reject(new WorkerMedplumError("no worker client for this facility"));
    let client = signedIn.get(facilityId);
    if (client === undefined) {
      client = connect({ baseUrl, clientId: credentials.clientId, clientSecret: credentials.clientSecret });
      // A failed sign-in is not cached: the next job tries again.
      client.catch(() => signedIn.delete(facilityId));
      signedIn.set(facilityId, client);
    }
    return client;
  }

  /** The client for a PHI job: the job data must name its tenant and facility (`phiJobDataSchema`). */
  function clientForJob(data: unknown): Promise<{ data: PhiJobData; client: MedplumClient }> {
    const parsed = phiJobDataSchema.safeParse(data);
    if (!parsed.success) return Promise.reject(new WorkerMedplumError("invalid PHI job data"));
    return createFacilityWorkerClient(parsed.data.facilityId).then((client) => ({ data: parsed.data, client }));
  }

  return { createFacilityWorkerClient, clientForJob };
}
