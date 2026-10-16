import { API_ERROR_CODES } from "@asc/types";
import type { FastifyReply, FastifyRequest } from "fastify";
import "../auth/augment.js";

interface IdempotencyRecord {
  readonly status: number;
  readonly payload: string;
  readonly contentType: string;
  readonly expiresAt: number;
}

interface IdempotencyStore {
  get(key: string): IdempotencyRecord | undefined;
  set(key: string, record: IdempotencyRecord): void;
  isInFlight(key: string): boolean;
  markInFlight(key: string): void;
  clearInFlight(key: string): void;
  clear(): void;
}

export function createInMemoryIdempotencyStore(_defaultTtlMs = 60_000): IdempotencyStore {

  const records = new Map<string, IdempotencyRecord>();
  const inFlight = new Set<string>();

  return {
    get(key: string): IdempotencyRecord | undefined {
      const record = records.get(key);
      if (!record) return undefined;
      if (Date.now() > record.expiresAt) {
        records.delete(key);
        return undefined;
      }
      return record;
    },
    set(key: string, record: IdempotencyRecord): void {
      records.set(key, record);
    },
    isInFlight(key: string): boolean {
      return inFlight.has(key);
    },
    markInFlight(key: string): void {
      inFlight.add(key);
    },
    clearInFlight(key: string): void {
      inFlight.delete(key);
    },
    clear(): void {
      records.clear();
      inFlight.clear();
    },
  };
}

const defaultStore = createInMemoryIdempotencyStore();

interface EntityParams {
  readonly caseId?: string;
  readonly itemId?: string;
  readonly patientId?: string;
  readonly referralId?: string;
}

export function getIdempotencyKey(request: FastifyRequest): string | undefined {
  const headerKey = request.headers["idempotency-key"] ?? request.headers["x-idempotency-key"];
  if (typeof headerKey === "string" && headerKey.trim().length > 0) {
    return headerKey.trim();
  }
  return undefined;
}

/**
 * Builds a composite cache key isolating idempotency records by tenant, HTTP method,
 * route template, case/item/entity ID, and raw header key.
 *
 * Prevents cross-patient, cross-work-item, cross-route, and cross-tenant cache collisions
 * or data leaks under HIPAA 45 CFR § 164.312(a)(1) and LM-038.
 */
export function buildScopedIdempotencyKey(request: FastifyRequest): string | undefined {
  const rawKey = getIdempotencyKey(request);
  if (!rawKey) {
    return undefined;
  }

  const tenantId = request.tenant?.tenantId;
  const route = request.routeOptions?.url ?? request.url?.split("?")[0] ?? "";
  const params = request.params as EntityParams | undefined;
  const entityPrefix = params?.caseId
    ? `case:${params.caseId}`
    : params?.itemId
      ? `item:${params.itemId}`
      : params?.patientId
        ? `patient:${params.patientId}`
        : params?.referralId
          ? `referral:${params.referralId}`
          : undefined;

  const prefix = [
    tenantId ? `tenant:${tenantId}` : undefined,
    `route:${request.method}:${route}`,
    entityPrefix,
  ]
    .filter((segment): segment is string => segment !== undefined)
    .join(":");

  return `${prefix}:${rawKey}`;
}

export function createIdempotencyHook(
  store: IdempotencyStore = defaultStore,
  ttlMs = 60_000,
  keyResolver: (request: FastifyRequest) => string | undefined = buildScopedIdempotencyKey,
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const key = keyResolver(request);
    if (!key) {
      return;
    }

    // 1. Check if response is already cached
    const cached = store.get(key);
    if (cached) {
      request.facilityChecked = true;
      reply.header("x-cache-lookup", "HIT");
      reply.header("idempotency-replayed", "true");
      reply.code(cached.status);
      reply.type(cached.contentType);
      reply.send(cached.payload);
      return;
    }


    // 2. Check if a concurrent request with the same key is currently in-flight
    if (store.isInFlight(key)) {
      reply.sendApiError({
        code: API_ERROR_CODES.IDEMPOTENCY_KEY_CONFLICT,
        status: 409,
        message: "A request with this idempotency key is currently being processed. Please wait.",
      });
      return;
    }

    // 3. Mark key as in-flight
    store.markInFlight(key);

    // 4. Wrap reply.send to capture and cache the response for this specific request
    const originalSend = reply.send.bind(reply);
    reply.send = (payload?: string | object | Buffer | null): FastifyReply => {
      try {
        if (reply.statusCode < 500 && payload !== undefined && payload !== null) {
          const stringified = typeof payload === "string" ? payload : JSON.stringify(payload);
          const rawContentType = reply.getHeader("content-type");
          const contentType = typeof rawContentType === "string" ? rawContentType : "application/json";
          store.set(key, {
            status: reply.statusCode,
            payload: stringified,
            contentType,
            expiresAt: Date.now() + ttlMs,
          });
        }
      } finally {
        store.clearInFlight(key);
      }
      return originalSend(payload);
    };

    reply.raw.once("close", () => {
      store.clearInFlight(key);
    });
  };
}

export const requireIdempotency = createIdempotencyHook();

