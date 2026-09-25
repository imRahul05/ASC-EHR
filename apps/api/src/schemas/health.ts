import { z } from "zod";

export const healthResponseSchema = {
  type: "object" as const,
  properties: {
    status: { type: "string" as const },
    timestamp: { type: "string" as const },
  },
  required: ["status", "timestamp"],
};

export const healthResponseZod = z.object({
  status: z.literal("ok"),
  timestamp: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseZod>;
