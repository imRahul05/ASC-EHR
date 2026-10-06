import { isProductionEnv } from "@asc/config/runtime";
import { isSensitiveKey, logger as baseLogger } from "@asc/logger";
import type { Logger } from "@asc/logger";

import { truncateClientIp } from "./client-ip.js";
import { isIamAction, sanitizeIamDetails } from "./iam-events.js";

export { truncateClientIp } from "./client-ip.js";
export * from "./iam-events.js";

export type ActorType = "user" | "system" | "agent" | "worker" | "bot" | "service";
export type Outcome = "SUCCESS" | "FAILURE" | "DENIED";

/** Authorization gate that denied the request (P05 §3): 1 tenant, 2 identity, 3 facility, 4 capability, 5 Medplum policy. */
export type AuditGate = 1 | 2 | 3 | 4 | 5;

/** Audit `details` values are flat primitives only: no nested objects/arrays. */
export type AuditDetailValue = string | number | boolean | null;
export type AuditDetails = Record<string, AuditDetailValue>;
/** What callers pass: `undefined` entries (optional fields) are skipped, never stored. */
export type AuditInputDetails = Record<string, AuditDetailValue | undefined>;

export type AuditCacheState = "hit" | "miss" | "bypass";

/**
 * Why an allow/deny decision was made (08 §12.3), so an auditor can reconstruct
 * it later: role template versions (`rn-v3`), the `@asc/authz` catalog version
 * (git SHA) and whether the identity came from the cache.
 */
export interface AuditDecision {
  readonly roleVersions: readonly string[];
  readonly catalogVersion: string;
  readonly cache: AuditCacheState;
}

export interface AuditEvent {
  action: string;
  actorType: ActorType;
  actorId: string;
  /** Legacy owner scope; `tenantId` and `facilityId` are the source of truth (Q-IAM-A). */
  organizationId?: string;
  /** Principal or job context, IDs only (08 §12.3). Never taken from a request body. */
  tenantId?: string;
  facilityId?: string;
  /** Medplum ProjectMembership id of the acting user (not a name or email). */
  membershipId?: string;
  sessionId?: string;
  patientId?: string;
  surgicalCaseId?: string;
  resourceType?: string;
  resourceId?: string;
  agentExecutionId?: string;
  requestId?: string;
  correlationId?: string;
  outcome: Outcome;
  /** Allow and deny events carry the provenance of the decision. */
  decision?: AuditDecision;
  /** Set on denials: which gate refused (makes misconfigured roles easy to spot). */
  gate?: AuditGate;
  timestamp: string; // ISO 8601
  /** Safe metadata only, NO PHI. Keys matching @asc/logger SENSITIVE_KEYS are rejected. */
  details?: AuditDetails;
  /** Set when disallowed `details` entries were dropped (production only). */
  detailsRedacted?: boolean;
  /** Network prefix of the client (`203.0.113.0/24`), never the full address. Set by the client from `clientIp`. */
  clientIpPrefix?: string;
  /** Browser/client string, cut to {@link MAX_USER_AGENT_LENGTH}. */
  userAgent?: string;
}

/** The raw `clientIp` is reduced to `clientIpPrefix` before any store sees the event. */
export type AuditEventInput = Omit<AuditEvent, "timestamp" | "detailsRedacted" | "clientIpPrefix" | "details"> & {
  details?: AuditInputDetails;
  clientIp?: string;
};

export const MAX_USER_AGENT_LENGTH = 200;

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

export class AuditDecisionError extends Error {
  constructor() {
    super(
      "Audit decision rejected: role versions and catalog version must be short identifiers " +
        "(letters, digits, '.', '_', '-'), never free text.",
    );
    this.name = "AuditDecisionError";
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

const DECISION_TOKEN = /^[A-Za-z0-9._-]{1,64}$/;

/** Same policy as `sanitizeDetails`: throw outside production, drop (and mark) in production. */
export function sanitizeDecision(
  decision: AuditDecision | undefined,
  production: boolean,
): { decision?: AuditDecision; detailsRedacted?: boolean } {
  if (decision === undefined) return {};
  const valid =
    DECISION_TOKEN.test(decision.catalogVersion) && decision.roleVersions.every((v) => DECISION_TOKEN.test(v));
  if (valid) return { decision: { ...decision, roleVersions: [...decision.roleVersions] } };
  if (!production) throw new AuditDecisionError();
  return { detailsRedacted: true };
}

export interface AuditClientOptions {
  /** Defaults to `isProductionEnv()` from @asc/config at construction. */
  production?: boolean;
}

export class AuditClient {
  private readonly production: boolean;

  constructor(
    private readonly store: AuditStore,
    options: AuditClientOptions = {},
  ) {
    this.production = options.production ?? isProductionEnv();
  }

  /**
   * Records an audit event. Store failures are NOT swallowed: if `store.save`
   * rejects, the rejection propagates so audit loss is visible to the caller.
   */
  async logEvent(event: AuditEventInput): Promise<void> {
    const { details, decision, clientIp, userAgent, ...rest } = event;
    const sanitizedDecision = sanitizeDecision(decision, this.production);
    const sanitizedDetails = sanitizeDetails(details, this.production);
    const iam = isIamAction(rest.action)
      ? sanitizeIamDetails(sanitizedDetails.details, this.production)
      : sanitizedDetails;
    const clientIpPrefix = clientIp === undefined ? undefined : truncateClientIp(clientIp);
    const fullEvent: AuditEvent = {
      ...rest,
      ...iam,
      ...sanitizedDecision,
      ...(sanitizedDetails.detailsRedacted || iam.detailsRedacted || sanitizedDecision.detailsRedacted
        ? { detailsRedacted: true }
        : {}),
      ...(clientIpPrefix === undefined ? {} : { clientIpPrefix }),
      ...(userAgent === undefined ? {} : { userAgent: userAgent.slice(0, MAX_USER_AGENT_LENGTH) }),
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
  const production = options.production ?? isProductionEnv();
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
