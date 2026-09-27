import { z } from "zod";

/** Error body of any non-2xx API response. Mirrors `ApiErrorPayload` in @asc/types. */
export const apiErrorPayloadSchema = z.object({
  message: z.string().optional(),
  code: z.string().optional(),
  details: z.record(z.string(), z.string()).optional(),
});
