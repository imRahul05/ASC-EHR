// Browser/Server shared fetch client to consume the fastify API
import { getPublicApiUrl } from "@repo/config/public-env";
import { healthResponseSchema, type HealthResponse } from "@repo/validation";

export type { HealthResponse };

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${getPublicApiUrl()}/health`);
  if (!res.ok) {
    throw new Error("Failed to fetch health status");
  }
  const parsed = healthResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error("Unexpected health response shape");
  }
  return parsed.data;
}
