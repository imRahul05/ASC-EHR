export type { HealthResponse } from "@asc/validation";

/** Fastify response JSON schema for GET /health (fast serialization). Shape mirrors `healthResponseSchema` in @asc/validation. */
export const healthResponseJsonSchema = {
  type: "object" as const,
  properties: {
    status: { type: "string" as const },
    timestamp: { type: "string" as const },
  },
  required: ["status", "timestamp"],
};
