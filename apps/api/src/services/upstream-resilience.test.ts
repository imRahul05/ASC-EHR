import { API_ERROR_CODES, isDomainError } from "@asc/types";
import { describe, expect, it } from "vitest";
import { isTransientError, withUpstreamResilience } from "./upstream-resilience.js";

describe("upstream-resilience", () => {
  it("identifies transient network and gateway errors correctly", () => {
    expect(isTransientError({ status: 503 })).toBe(true);
    expect(isTransientError({ statusCode: 502 })).toBe(true);
    expect(isTransientError({ code: "ECONNRESET" })).toBe(true);
    expect(isTransientError(new Error("fetch failed"))).toBe(true);
    expect(isTransientError({ status: 404 })).toBe(false);
    expect(isTransientError({ status: 400 })).toBe(false);
  });

  it("returns operation result immediately on success", async () => {
    let calls = 0;
    const result = await withUpstreamResilience(async () => {
      await Promise.resolve();
      calls++;
      return "healthy-response";
    });

    expect(result).toBe("healthy-response");
    expect(calls).toBe(1);
  });

  it("retries on transient failure and resolves when subsequent attempt succeeds", async () => {
    let calls = 0;
    const result = await withUpstreamResilience(
      async () => {
        await Promise.resolve();
        calls++;
        if (calls === 1) {
          const err = new Error("ECONNRESET");
          Object.assign(err, { code: "ECONNRESET" });
          throw err;
        }
        return "recovered-data";
      },
      { initialDelayMs: 5, retries: 2 },
    );

    expect(result).toBe("recovered-data");
    expect(calls).toBe(2);
  });

  it("does not retry on non-transient error like 404", async () => {
    let calls = 0;
    let thrownError: Error | null = null;
    try {
      await withUpstreamResilience(async () => {
        await Promise.resolve();
        calls++;
        const err = new Error("Resource not found");
        Object.assign(err, { status: 404 });
        throw err;
      });
    } catch (err) {
      thrownError = err instanceof Error ? err : new Error(String(err));
    }

    expect(calls).toBe(1);
    expect(thrownError).toBeDefined();
    expect(thrownError?.message).toBe("Resource not found");
  });

  it("throws UPSTREAM_SERVICE_UNAVAILABLE when retries are exhausted", async () => {
    let calls = 0;
    let caughtError: Error | null = null;
    try {
      await withUpstreamResilience(
        async () => {
          await Promise.resolve();
          calls++;
          const err = new Error("service unavailable");
          Object.assign(err, { status: 503 });
          throw err;
        },
        { initialDelayMs: 2, maxDelayMs: 10, retries: 2 },
      );

    } catch (err) {
      caughtError = err instanceof Error ? err : new Error(String(err));
    }

    expect(calls).toBe(3);
    expect(caughtError).toBeDefined();
    expect(isDomainError(caughtError)).toBe(true);
    if (isDomainError(caughtError)) {
      expect(caughtError.code).toBe(API_ERROR_CODES.UPSTREAM_SERVICE_UNAVAILABLE);
      expect(caughtError.status).toBe(503);
    }
  });

  it("times out and aborts operation when hanging beyond timeoutMs", async () => {
    let aborted = false;
    let caughtError: Error | null = null;
    try {
      await withUpstreamResilience(
        async (signal) => {
          signal.addEventListener("abort", () => {
            aborted = true;
          });
          await new Promise((resolve) => setTimeout(resolve, 200));
          return "never-reached";
        },
        { timeoutMs: 20, retries: 1, initialDelayMs: 5 },
      );
    } catch (err) {
      caughtError = err instanceof Error ? err : new Error(String(err));
    }

    expect(aborted).toBe(true);
    expect(caughtError).toBeDefined();
    expect(isDomainError(caughtError)).toBe(true);
  });
});
