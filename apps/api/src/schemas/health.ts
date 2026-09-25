export type { HealthResponse } from "@repo/validation";

/** Fastify response JSON schema for GET /health (fast serialization). Shape mirrors `healthResponseSchema` in @repo/validation. */
export const healthResponseJsonSchema = {
  type: "object" as const,
  properties: {
    status: { type: "string" as const },
    timestamp: { type: "string" as const },
  },
  required: ["status", "timestamp"],
};
