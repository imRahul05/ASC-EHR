import { createOnBehalfClient, type MedplumClient } from "@asc/api-client/server";
import type { FastifyInstance, FastifyRequest } from "fastify";

import { bearerToken } from "../auth/authn.js";

declare module "fastify" {
  interface FastifyRequest {
    /**
     * Medplum AS the signed-in user (their own access token, #55/#57): Medplum's access policy (gate 5) and its
     * audit events apply to that user. Only after gate 2; the API has no Medplum identity of its own. Facility
     * writes go through `forFacility(request.medplum, facilityId)`.
     */
    readonly medplum: MedplumClient;
  }
}

/** Medplum is not configured for this API. An outage, not a decision: 503, nothing audited. */
export class MedplumUnavailableError extends Error {
  readonly statusCode = 503;
  constructor() {
    super("Medplum is not configured");
    this.name = "MedplumUnavailableError";
  }
}

const CLIENT = Symbol("medplum");
type WithClient = FastifyRequest & { [CLIENT]?: MedplumClient };

export function registerMedplum(
  app: FastifyInstance,
  { baseUrl, createClient = createOnBehalfClient }: { baseUrl: string | undefined; createClient?: typeof createOnBehalfClient },
): void {
  app.decorateRequest("medplum", {
    getter(this: FastifyRequest): MedplumClient {
      const request = this as WithClient;
      const cached = request[CLIENT];
      if (cached !== undefined) return cached;
      // Gate 2 must have run: a public route has no user to act for.
      if (request.principal === undefined) throw new Error("request.medplum is only available after authentication");
      const accessToken = bearerToken(request.headers.authorization);
      if (accessToken === undefined) throw new Error("request.medplum is only available after authentication");
      if (baseUrl === undefined) throw new MedplumUnavailableError();
      const client = createClient({ baseUrl, accessToken });
      request[CLIENT] = client;
      return client;
    },
  });
}
