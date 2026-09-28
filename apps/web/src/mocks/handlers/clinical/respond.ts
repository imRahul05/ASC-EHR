import type { ApiErrorPayload, CaseDetail, RuleResult } from "@asc/types";
import { delay, HttpResponse } from "msw";
import { caseDetail } from "../../db/store";
import { latencyMs } from "../../db/util";

/** Same error body shape as apps/api (`ApiErrorPayload`), so @asc/api-client maps it to ApiError. */
export function apiError(status: number, code: string, message: string, details?: Record<string, string>) {
  const body: ApiErrorPayload = { message, code, ...(details ? { details } : {}) };
  return HttpResponse.json(body, { status });
}

export const notFound = (what: string) => apiError(404, `${what.toUpperCase()}_NOT_FOUND`, `${what} not found`);

/** 422 GATE_FAILED with every failing reason (`details`: reason code → message). */
export function gateFailed(result: RuleResult, status = 422) {
  const details = Object.fromEntries(result.reasons.map((reason) => [reason.code, reason.message]));
  const code = result.reasons[0]?.code === "TRANSITION_NOT_ALLOWED" ? "TRANSITION_NOT_ALLOWED" : "GATE_FAILED";
  return apiError(code === "TRANSITION_NOT_ALLOWED" ? 409 : status, code, result.reasons[0]?.message ?? "Rule check failed", details);
}

/** Realistic latency (150–400 ms). */
export function latency(): Promise<void> {
  return delay(latencyMs());
}

export function param(value: string | readonly string[] | undefined): string {
  return typeof value === "string" ? value : (value?.[0] ?? "");
}

export async function body<T>(request: Request): Promise<T> {
  return (await request.json().catch(() => ({}))) as T;
}

/** Responds with the current CaseDetail (or 404). */
export function detailResponse(caseId: string) {
  const detail: CaseDetail | null = caseDetail(caseId);
  return detail ? HttpResponse.json(detail) : notFound("Case");
}
