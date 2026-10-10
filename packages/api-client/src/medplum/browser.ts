import { ClientStorage, MedplumClient, MemoryStorage } from "@medplum/core";
import { getPublicMedplumBaseUrl, getPublicMedplumClientId } from "@asc/config/public-env";

let cachedBrowserClient: MedplumClient | undefined;

/**
 * apps/web: the signed-in user's own client (PKCE sign-in arrives in P05j). Tokens live in memory only, never in
 * localStorage (LM-004), and the base URL is required: Medplum's default is a hosted service PHI must never reach.
 * Returns `undefined` when Medplum is not configured (the hosted demo runs on in-browser mocks).
 */
export function createBrowserMedplumClient({
  baseUrl,
  clientId,
}: {
  baseUrl: string | undefined;
  clientId: string | undefined;
}): MedplumClient | undefined {
  if (baseUrl === undefined || baseUrl.length === 0) return undefined;
  if (!/^https?:\/\/.+\/$/.test(baseUrl)) throw new Error("Medplum base URL must be an http(s) URL ending in /");
  return new MedplumClient({
    baseUrl,
    storage: new ClientStorage(new MemoryStorage()),
    ...(clientId === undefined || clientId.length === 0 ? {} : { clientId }),
  });
}

/**
 * Returns the singleton browser Medplum client initialized with public env, or undefined if unconfigured.
 */
export function getBrowserMedplumClient(): MedplumClient | undefined {
  if (cachedBrowserClient === undefined) {
    cachedBrowserClient = createBrowserMedplumClient({
      baseUrl: getPublicMedplumBaseUrl(),
      clientId: getPublicMedplumClientId(),
    });
  }
  return cachedBrowserClient;
}

/**
 * Resets the singleton browser Medplum client (useful for test resets).
 */
export function resetBrowserMedplumClient(): void {
  cachedBrowserClient = undefined;
}
