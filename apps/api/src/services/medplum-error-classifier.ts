interface ClassifiedReadError {
  readonly status: number;
  readonly code: string;
  readonly message: string;
}

interface MedplumIssue {
  readonly severity?: string;
  readonly code?: string;
  readonly details?: { readonly text?: string };
}

interface MedplumOutcomeError extends Error {
  readonly status?: number;
  readonly statusCode?: number;
  readonly outcome?: {
    readonly issue?: readonly MedplumIssue[];
  };
}

type ResourceKind = "patient" | "primary_physician" | "anesthesiologist";

/**
 * Classifies Medplum client read errors into HTTP status codes and domain error codes.
 */
export function classifyMedplumReadError(
  error: Error,
  resourceKind: ResourceKind,
  resourceId: string,
): ClassifiedReadError {
  const err = error as MedplumOutcomeError;

  const status = err.status ?? err.statusCode;
  const isNotFound =
    status === 404 ||
    err.outcome?.issue?.some((i) => i.code === "not-found") ||
    err.message.toLowerCase().includes("not found");

  if (isNotFound) {
    return {
      status: 404,
      code: `${resourceKind}_not_found`,
      message: `${resourceKind.replace("_", " ")} with ID ${resourceId} does not exist`,
    };
  }

  const isForbidden =
    status === 403 ||
    status === 401 ||
    err.outcome?.issue?.some((i) => i.code === "security" || i.code === "forbidden") ||
    err.message.toLowerCase().includes("forbidden") ||
    err.message.toLowerCase().includes("unauthorized");

  if (isForbidden) {
    return {
      status: 403,
      code: "forbidden",
      message: `Access denied reading ${resourceKind.replace("_", " ")} ${resourceId}`,
    };
  }

  const isUnavailable =
    status === 503 ||
    status === 502 ||
    status === 504 ||
    err.message.toLowerCase().includes("econnrefused") ||
    err.message.toLowerCase().includes("timeout") ||
    err.message.toLowerCase().includes("unavailable") ||
    err.message.toLowerCase().includes("network");

  if (isUnavailable) {
    return {
      status: 503,
      code: "upstream_service_unavailable",
      message: "Upstream clinical data service is temporarily unavailable",
    };
  }

  return {
    status: 500,
    code: "internal_error",
    message: `Unexpected error reading ${resourceKind.replace("_", " ")}`,
  };
}
