import { API_ERROR_CODES, createDomainError } from "@asc/types";

interface RetryOptions {
  readonly retries?: number;
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly timeoutMs?: number;
}

interface NetworkErrorLike {
  readonly name?: string;
  readonly message?: string;
  readonly code?: string;
  readonly status?: number;
  readonly statusCode?: number;
  readonly cause?: NetworkErrorLike;
}

export function isTransientError(err: Error | object | null | undefined): boolean {
  if (!err || typeof err !== "object") return false;
  const netErr = err as NetworkErrorLike;

  const status = netErr.status ?? netErr.statusCode;
  if (status === 502 || status === 503 || status === 504 || status === 429) {
    return true;
  }

  const name = netErr.name ?? "";
  if (name === "AbortError" || name === "TimeoutError") {
    return true;
  }

  const code = netErr.code ?? "";
  const transientCodes = [
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNREFUSED",
    "EAI_AGAIN",
    "ENOTFOUND",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_SOCKET",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_BODY_TIMEOUT",
    "ERR_STREAM_PREMATURE_CLOSE",
  ];
  if (transientCodes.includes(code)) {
    return true;
  }

  const msg = (netErr.message ?? "").toLowerCase();
  if (
    msg.includes("fetch failed") ||
    msg.includes("network error") ||
    msg.includes("socket hang up") ||
    msg.includes("gateway timeout") ||
    msg.includes("bad gateway") ||
    msg.includes("service unavailable")
  ) {
    return true;
  }

  if (netErr.cause) {
    return isTransientError(netErr.cause);
  }

  return false;
}

export async function withUpstreamResilience<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const retries = options?.retries ?? 3;
  const initialDelayMs = options?.initialDelayMs ?? 20;
  const maxDelayMs = options?.maxDelayMs ?? 500;
  const timeoutMs = options?.timeoutMs ?? 5000;

  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    let timeoutId: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        const timeoutErr = new Error("Upstream request timed out");
        timeoutErr.name = "TimeoutError";
        reject(timeoutErr);
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([
        operation(controller.signal),
        timeoutPromise,
      ]);
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      return result;
    } catch (error) {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      const err = error instanceof Error ? error : new Error(String(error));

      if (!isTransientError(err)) {
        throw err;
      }

      attempt++;
      if (attempt > retries) {
        throw createDomainError(API_ERROR_CODES.UPSTREAM_SERVICE_UNAVAILABLE, {
          message: "Upstream clinical data service is temporarily unavailable.",
        });
      }

      const backoffDelay = Math.min(maxDelayMs, initialDelayMs * Math.pow(2, attempt));
      const jittered = Math.floor(backoffDelay * (0.5 + Math.random() * 0.5));
      await new Promise((resolve) => setTimeout(resolve, jittered));
    }
  }
}
