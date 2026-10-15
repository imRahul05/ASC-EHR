export const API_ERROR_CODES = {
  INVALID_PAYLOAD: "invalid_payload",
  INVALID_QUERY: "invalid_query",
  FACILITY_REQUIRED: "facility_required",
  INVALID_CASE_ID: "invalid_case_id",
  INVALID_ROOM: "invalid_room",
  INACTIVE_PRACTITIONER: "inactive_or_invalid_practitioner",
  BAD_REQUEST: "bad_request",
  UNAUTHENTICATED: "unauthenticated",
  FORBIDDEN: "forbidden",
  FACILITY_ACCESS_DENIED: "facility_access_denied",
  NOT_FOUND: "not_found",
  PATIENT_NOT_FOUND: "patient_not_found",
  PRIMARY_PHYSICIAN_NOT_FOUND: "primary_physician_not_found",
  ANESTHESIOLOGIST_NOT_FOUND: "anesthesiologist_not_found",
  CONFLICT: "conflict",
  GATE_FAILED: "GATE_FAILED",
  IDEMPOTENCY_KEY_CONFLICT: "idempotency_key_conflict",
  DUPLICATE_MRN_CONFLICT: "duplicate_mrn_conflict",
  DUPLICATE_PATIENT_DETECTED: "duplicate_patient_detected",
  RATE_LIMITED: "rate_limited",
  INTERNAL_ERROR: "internal_error",
  INCOMPLETE_TRANSACTION: "incomplete_transaction",
  UNAVAILABLE: "unavailable",
  UPSTREAM_SERVICE_UNAVAILABLE: "upstream_service_unavailable",
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

import type { ConflictReason } from "./api.js";
import type { DuplicateMatchResult } from "./clinical.js";

export interface ErrorDefinition {
  readonly status: number;
  readonly defaultMessage: string;
}

export interface SendApiErrorOptions {
  readonly code: ApiErrorCode;
  readonly status?: number;
  readonly message?: string;
  readonly details?: Record<string, string>;
  readonly duplicateMatch?: DuplicateMatchResult;
  readonly reasons?: readonly ConflictReason[];
}

export const API_ERROR_REGISTRY: Record<ApiErrorCode, ErrorDefinition> = {
  [API_ERROR_CODES.INVALID_PAYLOAD]: { status: 400, defaultMessage: "Invalid request payload." },
  [API_ERROR_CODES.INVALID_QUERY]: { status: 400, defaultMessage: "Invalid request query parameters." },
  [API_ERROR_CODES.FACILITY_REQUIRED]: { status: 400, defaultMessage: "Facility context is required." },
  [API_ERROR_CODES.INVALID_CASE_ID]: { status: 400, defaultMessage: "Invalid case ID format." },
  [API_ERROR_CODES.INVALID_ROOM]: { status: 400, defaultMessage: "Specified room is invalid or unsupported." },
  [API_ERROR_CODES.INACTIVE_PRACTITIONER]: { status: 400, defaultMessage: "Practitioner is inactive or invalid." },
  [API_ERROR_CODES.BAD_REQUEST]: { status: 400, defaultMessage: "Bad request." },
  [API_ERROR_CODES.UNAUTHENTICATED]: { status: 401, defaultMessage: "Authentication required." },
  [API_ERROR_CODES.FORBIDDEN]: { status: 403, defaultMessage: "You do not have access to this resource." },
  [API_ERROR_CODES.FACILITY_ACCESS_DENIED]: { status: 403, defaultMessage: "Resource is not associated with this facility." },
  [API_ERROR_CODES.NOT_FOUND]: { status: 404, defaultMessage: "Resource not found." },
  [API_ERROR_CODES.PATIENT_NOT_FOUND]: { status: 404, defaultMessage: "Patient not found." },
  [API_ERROR_CODES.PRIMARY_PHYSICIAN_NOT_FOUND]: { status: 404, defaultMessage: "Primary physician not found." },
  [API_ERROR_CODES.ANESTHESIOLOGIST_NOT_FOUND]: { status: 404, defaultMessage: "Anesthesiologist not found." },
  [API_ERROR_CODES.CONFLICT]: { status: 409, defaultMessage: "A conflict occurred while processing the request." },
  [API_ERROR_CODES.GATE_FAILED]: { status: 409, defaultMessage: "Clinical gate rejected the transition." },
  [API_ERROR_CODES.IDEMPOTENCY_KEY_CONFLICT]: { status: 409, defaultMessage: "Idempotency key was used with conflicting parameters." },
  [API_ERROR_CODES.DUPLICATE_MRN_CONFLICT]: { status: 409, defaultMessage: "A patient with this MRN already exists at this facility." },
  [API_ERROR_CODES.DUPLICATE_PATIENT_DETECTED]: { status: 409, defaultMessage: "Potential duplicate patient detected." },
  [API_ERROR_CODES.RATE_LIMITED]: { status: 429, defaultMessage: "Too many requests. Please try again later." },
  [API_ERROR_CODES.INTERNAL_ERROR]: { status: 500, defaultMessage: "Internal server error." },
  [API_ERROR_CODES.INCOMPLETE_TRANSACTION]: { status: 500, defaultMessage: "Incomplete transaction. Manual reconciliation required." },
  [API_ERROR_CODES.UNAVAILABLE]: { status: 503, defaultMessage: "Service temporarily unavailable." },
  [API_ERROR_CODES.UPSTREAM_SERVICE_UNAVAILABLE]: { status: 503, defaultMessage: "Upstream clinical data service is temporarily unavailable." },
};
