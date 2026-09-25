import { isSensitiveKey, logger as baseLogger } from "@repo/logger";
import type { Logger } from "@repo/logger";

export type ActorType = "user" | "system" | "agent";
export type Outcome = "SUCCESS" | "FAILURE" | "DENIED";

/** Audit `details` values are flat primitives only: no nested objects/arrays. */
export type AuditDetailValue = string | number | boolean | null;
export type AuditDetails = Record<string, AuditDetailValue>;

export interface AuditEvent {
  action: string;
  actorType: ActorType;
  actorId: string;
  organizationId?: string;
  patientId?: string;
  surgicalCaseId?: string;
  resourceType?: string;
  resourceId?: string;
  agentExecutionId?: string;
  requestId?: string;
  correlationId?: string;
  outcome: Outcome;
  timestamp: string; // ISO 8601
  /** Safe metadata only, NO PHI. Keys matching @repo/logger SENSITIVE_KEYS are rejected. */
  details?: AuditDetails;
  /** Set when disallowed `details` entries were dropped (production only). */
  detailsRedacted?: boolean;
}

export type AuditEventInput = Omit<AuditEvent, "timestamp" | "detailsRedacted">;

/**
 * Storage seam for audit events. The planned durable store is Medplum
 * AuditEvent (docs/decisions/2026-09-25-adopt-medplum-as-clinical-data-platform.md);
 * inject it at app startup via `configureAuditStore`.
 */
export interface AuditStore {
  save(event: AuditEvent): Promise<void>;
  /**
   * True only for stores that persist events durably (DB, Medplum, ...).
   * Non-durable stores are refused in production.
   */
  readonly durable?: boolean;
}

/**
 * Non-durable store for development/staging: writes each event through a
 * dedicated pino child logger (`channel: "audit"`) so it still gets redaction.
 * NOT acceptable as the production audit trail.
 */
export class LoggerAuditStore implements AuditStore {
  readonly durable = false;
  private readonly log: Logger;

  constructor(parent: Logger = baseLogger) {
    this.log = parent.child({ channel: "audit" });
  }

  save(event: AuditEvent): Promise<void> {
    this.log.info({ auditEvent: event }, "audit event");
    return Promise.resolve();
  }
}

export class AuditDetailsError extends Error {
  constructor(readonly offendingKeys: string[]) {
    super(
      `Audit details rejected: disallowed keys [${offendingKeys.join(", ")}] ` +
        "(PHI/secret key names or non-primitive values). Audit details must be flat, PHI-free metadata.",
    );
    this.name = "AuditDetailsError";
  }
}

export class AuditStoreNotConfiguredError extends Error {
  constructor() {
    super(
      "No durable AuditStore configured: refusing to fall back to the non-durable " +
        "LoggerAuditStore in production. Call configureAuditStore(durableStore) at startup.",
    );
    this.name = "AuditStoreNotConfiguredError";
  }
}

function isPrimitive(value: unknown): value is AuditDetailValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

/**
 * Validates `details` against PHI rules.
 *
 * Policy: outside production we THROW (AuditDetailsError) so developers find
 * the leak immediately; in production we never lose the audit event itself,
 * so offending entries are DROPPED and the event is marked `detailsRedacted: true`.
 */
export function sanitizeDetails(
  details: Record<string, unknown> | undefined,
  production: boolean,
): { details?: AuditDetails; detailsRedacted?: boolean } {
  if (details === undefined) return {};
  const clean: AuditDetails = {};
  const offending: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (value === undefined) continue;
    if (isSensitiveKey(key) || !isPrimitive(value)) {
      offending.push(key);
      continue;
    }
    clean[key] = value;
  }
  if (offending.length === 0) return { details: clean };
  if (!production) throw new AuditDetailsError(offending);
  return { details: clean, detailsRedacted: true };
}

export interface AuditClientOptions {
  /** Defaults to `process.env.NODE_ENV === "production"` at construction. */
  production?: boolean;
}

export class AuditClient {
  private readonly production: boolean;

  constructor(
    private readonly store: AuditStore,
    options: AuditClientOptions = {},
  ) {
    this.production = options.production ?? process.env.NODE_ENV === "production";
  }

  /**
   * Records an audit event. Store failures are NOT swallowed: if `store.save`
   * rejects, the rejection propagates so audit loss is visible to the caller.
   */
  async logEvent(event: AuditEventInput): Promise<void> {
    const { details, ...rest } = event;
    const fullEvent: AuditEvent = {
      ...rest,
      ...sanitizeDetails(details, this.production),
      timestamp: new Date().toISOString(),
    };
    await this.store.save(fullEvent);
  }
}

/**
 * Creates an AuditClient. Without a store, falls back to LoggerAuditStore,
 * except in production where it fails closed (throws AuditStoreNotConfiguredError).
 * A non-durable store passed explicitly in production is also refused.
 */
export function createAuditClient(store?: AuditStore, options: AuditClientOptions = {}): AuditClient {
  const production = options.production ?? process.env.NODE_ENV === "production";
  const resolved = store ?? new LoggerAuditStore();
  if (production && resolved.durable !== true) {
    throw new AuditStoreNotConfiguredError();
  }
  return new AuditClient(resolved, { production });
}

let configuredStore: AuditStore | undefined;
let defaultClient: AuditClient | undefined;

/**
 * Injects the durable audit store (e.g. Medplum AuditEvent) at app startup.
 * Resets the default client so the next `auditClient.logEvent` uses it.
 */
export function configureAuditStore(store: AuditStore): void {
  configuredStore = store;
  defaultClient = undefined;
}

/** Returns the lazily-created default client (throws in production if unconfigured). */
export function getAuditClient(): AuditClient {
  defaultClient ??= createAuditClient(configuredStore);
  return defaultClient;
}

/**
 * Default audit client. Lazily initialized on first use, so importing this
 * package in production does not throw; using it without a durable store does.
 */
export const auditClient: Pick<AuditClient, "logEvent"> = {
  async logEvent(event: AuditEventInput): Promise<void> {
    await getAuditClient().logEvent(event);
  },
};
