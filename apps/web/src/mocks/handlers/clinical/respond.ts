import {
  API_ERROR_CODES,
  type ApiErrorCode,
  type ApiErrorPayload,
  type CaseDetail,
  type RuleResult,
} from "@asc/types";
import { delay, HttpResponse } from "msw";
import { caseDetail } from "../../db/store";
import { latencyMs } from "../../db/util";

/** Same error body shape as apps/api (`ApiErrorPayload`), so @asc/api-client maps it to ApiError. */
export function apiError(
  status: number,
  code: ApiErrorCode | (string & {}),
  message: string,
  details?: Record<string, string>,
  reasons?: readonly { readonly code: string; readonly message: string }[],
) {
  const body: ApiErrorPayload = {
    message,
    code,
    ...(details ? { details } : {}),
    ...(reasons ? { reasons } : {}),
  };
  return HttpResponse.json(body, { status });
}

export const notFound = (what: string) =>
  apiError(
    404,
    what === "Case" ? API_ERROR_CODES.NOT_FOUND : `${what.toLowerCase()}_not_found`,
    `${what} not found`,
  );
export const caseNotFound = (caseId: string) =>
  apiError(404, API_ERROR_CODES.NOT_FOUND, `Case ${caseId} not found`);

/** 409 GATE_FAILED matching Fastify byte-for-byte ({ code: "GATE_FAILED", message, reasons }). */
export function gateFailed(result: RuleResult, status = 409) {
  return apiError(
    status,
    API_ERROR_CODES.GATE_FAILED,
    result.reasons[0]?.message ?? "Clinical gate rejected transition",
    undefined,
    result.reasons,
  );
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
  return detail ? HttpResponse.json(detail) : caseNotFound(caseId);
}
