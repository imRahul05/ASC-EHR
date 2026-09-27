import { API_ROUTES } from "@asc/config/api";
import { healthResponseSchema, type HealthResponse } from "@asc/validation/health";
import { http } from "./http";

export type { HealthResponse };

export async function fetchHealth(): Promise<HealthResponse> {
  const parsed = healthResponseSchema.safeParse(await http.get<unknown>(API_ROUTES.health));
  if (!parsed.success) {
    throw new Error("Unexpected health response shape");
  }
  return parsed.data;
}
