// "@asc/api-client/server": Medplum clients for server processes (apps/api, apps/worker). Never imported by
// apps/web (lint rule): it is where a client secret can exist. Apps never construct MedplumClient themselves.
import { ClientStorage, MedplumClient, MemoryStorage } from "@medplum/core";

export { DIRECTORY_RESOURCE_TYPES, forFacility, type FacilityWriter } from "./medplum/facility.js";
export type { MedplumClient } from "@medplum/core";

/**
 * Shared server options: an explicit base URL (the Medplum default is a hosted service PHI must never reach),
 * tokens in memory only, and no response cache, so a revoked grant is never served from a cache (#57).
 */
function serverClient(baseUrl: string, extra: { clientId?: string; clientSecret?: string } = {}): MedplumClient {
  if (!/^https?:\/\/.+\/$/.test(baseUrl)) throw new Error("Medplum base URL must be an http(s) URL ending in /");
  return new MedplumClient({ baseUrl, storage: new ClientStorage(new MemoryStorage()), cacheTime: 0, ...extra });
}

/**
 * apps/api, per request: acts AS the signed-in user with the user's own access token, so Medplum's access
 * policy and audit events apply to that user (#55, #57). There is deliberately no client-credentials path for
 * the API: it has no Medplum identity of its own.
 */
export function createOnBehalfClient({ baseUrl, accessToken }: { baseUrl: string; accessToken: string }): MedplumClient {
  if (accessToken.length === 0) throw new Error("an access token is required");
  const client = serverClient(baseUrl);
  client.setAccessToken(accessToken);
  return client;
}

/**
 * apps/worker: a confidential client signed in with the client credentials grant. The worker picks WHICH
 * credentials from the job's validated facility (#60); Medplum re-authenticates when the token expires.
 */
export async function createClientCredentialsClient({
  baseUrl,
  clientId,
  clientSecret,
}: {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}): Promise<MedplumClient> {
  const client = serverClient(baseUrl, { clientId, clientSecret });
  await client.startClientLogin(clientId, clientSecret);
  return client;
}

export interface MedplumAuthMe {
  readonly user?: { readonly id?: string; readonly resourceType?: string };
  readonly project?: { readonly id?: string; readonly resourceType?: string };
  readonly membership?: {
    readonly id?: string;
    readonly resourceType?: string;
    readonly profile?: { readonly reference?: string; readonly display?: string };
    readonly user?: { readonly reference?: string };
    readonly admin?: boolean;
    readonly active?: boolean;
  };
  readonly profile?: { readonly id?: string; readonly resourceType?: string; readonly [key: string]: unknown };
  readonly accessPolicy?: { readonly id?: string; readonly resourceType?: string; readonly basedOn?: readonly { readonly reference?: string }[] };
  readonly security?: { readonly mfaEnrolled?: boolean };
}

/**
 * Fetches the caller's identity, project and membership from Medplum `/auth/me` on behalf of the signed-in user (#57).
 */
export async function fetchAuthMe(client: MedplumClient): Promise<MedplumAuthMe> {
  const result: unknown = await client.get("auth/me");
  return result as MedplumAuthMe;
}

