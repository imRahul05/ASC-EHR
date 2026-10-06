import type { ActorType, AuditDecision, AuditDetails, AuditGate, Outcome } from '@asc/audit';
import { sql } from 'drizzle-orm';
import { boolean, check, index, jsonb, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const AUDIT_ACTOR_TYPES = ['user', 'system', 'agent', 'worker', 'bot', 'service'] as const satisfies readonly ActorType[];
export const AUDIT_OUTCOMES = ['SUCCESS', 'FAILURE', 'DENIED'] as const satisfies readonly Outcome[];

/**
 * Durable, append-only audit trail (08 §12.3). One row per `AuditEvent` from
 * `@asc/audit`. Rows are never updated or deleted: the runtime role has only
 * SELECT and INSERT, and a trigger rejects UPDATE, DELETE and TRUNCATE even for
 * the table owner (see the `audit_events_append_only` migration).
 *
 * IDs and keys only, no PHI: `details` is flat primitives (sanitized by
 * `@asc/audit`), `client_ip_prefix` is a /24 or /48 prefix, never the address.
 * Row-level security is forced on `tenant_id`, as for `agent_runs`.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    facilityId: text('facility_id'),
    /** The event's own timestamp (when it happened). */
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull(),
    /** Database clock at insert (when it was recorded). */
    recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    action: text('action').notNull(),
    actorType: text('actor_type', { enum: AUDIT_ACTOR_TYPES }).notNull(),
    actorId: text('actor_id').notNull(),
    membershipId: text('membership_id'),
    sessionId: text('session_id'),
    outcome: text('outcome', { enum: AUDIT_OUTCOMES }).notNull(),
    gate: smallint('gate').$type<AuditGate>(),
    /** Legacy owner scope; `tenant_id` and `facility_id` are the source of truth (Q-IAM-A). */
    organizationId: text('organization_id'),
    patientId: text('patient_id'),
    surgicalCaseId: text('surgical_case_id'),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    agentExecutionId: text('agent_execution_id'),
    requestId: text('request_id'),
    correlationId: text('correlation_id'),
    clientIpPrefix: text('client_ip_prefix'),
    userAgent: text('user_agent'),
    /** Role template versions, catalog version, identity cache state. */
    decision: jsonb('decision').$type<AuditDecision>(),
    details: jsonb('details').$type<AuditDetails>(),
    detailsRedacted: boolean('details_redacted').notNull().default(false),
  },
  (table) => [
    check('audit_events_actor_type_check', sql`${table.actorType} IN ('user', 'system', 'agent', 'worker', 'bot', 'service')`),
    check('audit_events_outcome_check', sql`${table.outcome} IN ('SUCCESS', 'FAILURE', 'DENIED')`),
    check('audit_events_gate_check', sql`${table.gate} IS NULL OR ${table.gate} BETWEEN 1 AND 5`),
    index('audit_events_tenant_occurred_at_idx').on(table.tenantId, table.occurredAt),
    index('audit_events_tenant_patient_idx').on(table.tenantId, table.patientId, table.occurredAt),
    index('audit_events_tenant_actor_idx').on(table.tenantId, table.actorId, table.occurredAt),
  ],
);

export type AuditEventRow = typeof auditEvents.$inferSelect;
