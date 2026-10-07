/**
 * Postgres implementation of `AuditStore` (@asc/audit): the durable, append-only
 * audit trail. Inject it at startup with `configureAuditStore`.
 *
 * Every save runs inside `withTenant`, so row-level security applies and an
 * event can only be written for the tenant it carries. IDs and keys only: the
 * `AuditClient` has already sanitized `details` and truncated the client IP.
 * Never log events or rows.
 */

import type { AuditEvent, AuditStore } from '@asc/audit';

import { auditEvents } from './schema/audit-events.js';
import type { TenantDb } from './tenant.js';

export interface PostgresAuditStoreOptions {
  /**
   * The configured tenant (`DEFAULT_TENANT_ID`) for events that carry no
   * `tenantId` (single hospital, tenant-ready). Comes from config, never from a request.
   */
  defaultTenantId?: string;
}

export class AuditTenantMissingError extends Error {
  constructor() {
    super('Audit event has no tenantId and no default tenant is configured: refusing to write it.');
    this.name = 'AuditTenantMissingError';
  }
}

export function createPostgresAuditStore(
  tenantDb: TenantDb,
  { defaultTenantId }: PostgresAuditStoreOptions = {},
): AuditStore & { readonly durable: true; readonly appendOnly: true } {
  return {
    durable: true,
    appendOnly: true,
    async save(event: AuditEvent): Promise<void> {
      const tenantId = event.tenantId ?? defaultTenantId;
      if (tenantId === undefined) throw new AuditTenantMissingError();
      await tenantDb.withTenant(tenantId, async (tx) => {
        await tx.insert(auditEvents).values({
          tenantId,
          facilityId: event.facilityId ?? null,
          occurredAt: new Date(event.timestamp),
          action: event.action,
          actorType: event.actorType,
          actorId: event.actorId,
          membershipId: event.membershipId ?? null,
          sessionId: event.sessionId ?? null,
          outcome: event.outcome,
          gate: event.gate ?? null,
          organizationId: event.organizationId ?? null,
          patientId: event.patientId ?? null,
          surgicalCaseId: event.surgicalCaseId ?? null,
          resourceType: event.resourceType ?? null,
          resourceId: event.resourceId ?? null,
          agentExecutionId: event.agentExecutionId ?? null,
          requestId: event.requestId ?? null,
          correlationId: event.correlationId ?? null,
          clientIpPrefix: event.clientIpPrefix ?? null,
          userAgent: event.userAgent ?? null,
          decision: event.decision ?? null,
          details: event.details ?? null,
          detailsRedacted: event.detailsRedacted ?? false,
        });
      });
    },
  };
}
