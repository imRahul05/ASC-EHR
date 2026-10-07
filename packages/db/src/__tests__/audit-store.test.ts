/**
 * The Postgres audit store, used through AuditClient, as the runtime role.
 * audit_events cannot be truncated (append-only), so each test uses its own tenant.
 */

import { randomUUID } from 'node:crypto';

import { AuditClient, createAuditClient, iamEvent, type AuditEvent } from '@asc/audit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuditTenantMissingError, createPostgresAuditStore } from '../audit-store.js';
import { DatabaseError } from '../db-error.js';
import { auditEvents } from '../schema/audit-events.js';
import { connectRuntime, createTestSchema, runtimeUrl, type RuntimeAccess, type TestSchema } from './test-db.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

describeDb(TEST_DATABASE_URL ? 'PostgresAuditStore' : 'PostgresAuditStore (SKIPPED: set TEST_DATABASE_URL)', () => {
  let t: TestSchema;
  let runtime: RuntimeAccess;

  const rowsOf = (tenantId: string) =>
    runtime.tenantDb.withTenant(tenantId, (tx) => tx.select().from(auditEvents));

  beforeAll(async () => {
    const url = TEST_DATABASE_URL as string;
    t = await createTestSchema(url, 'test_audit_store');
    runtime = connectRuntime(runtimeUrl(url, process.env.TEST_RUNTIME_DATABASE_URL), t.schemaName);
  });
  afterAll(async () => {
    await runtime?.close();
    await t?.drop();
  });

  it('declares itself durable and append-only, so production accepts it', () => {
    const store = createPostgresAuditStore(runtime.tenantDb);
    expect(store).toMatchObject({ durable: true, appendOnly: true });
    expect(() => createAuditClient(store, { production: true })).not.toThrow();
  });

  it('saves every field of an event and reads it back for its tenant', async () => {
    const tenantId = randomUUID();
    const event: AuditEvent = {
      action: 'case.read',
      actorType: 'user',
      actorId: 'user-1',
      membershipId: 'membership-1',
      sessionId: 'session-1',
      tenantId,
      facilityId: 'facility-1',
      organizationId: 'org-1',
      patientId: 'patient-1',
      surgicalCaseId: 'case-1',
      resourceType: 'Composition',
      resourceId: 'comp-1',
      agentExecutionId: 'exec-1',
      requestId: 'req-1',
      correlationId: 'corr-1',
      outcome: 'DENIED',
      gate: 3,
      decision: { roleVersions: ['rn-v3'], catalogVersion: '3b350a5', cache: 'bypass' },
      details: { reason: 'wrong-facility', count: 2, flag: true, none: null },
      detailsRedacted: true,
      clientIpPrefix: '203.0.113.0/24',
      userAgent: 'test-agent',
      timestamp: '2026-10-06T12:00:00.000Z',
    };
    await createPostgresAuditStore(runtime.tenantDb).save(event);
    const [row] = await rowsOf(tenantId);
    expect(row).toMatchObject({
      tenantId,
      facilityId: 'facility-1',
      action: 'case.read',
      actorType: 'user',
      actorId: 'user-1',
      membershipId: 'membership-1',
      sessionId: 'session-1',
      outcome: 'DENIED',
      gate: 3,
      organizationId: 'org-1',
      patientId: 'patient-1',
      surgicalCaseId: 'case-1',
      resourceType: 'Composition',
      resourceId: 'comp-1',
      agentExecutionId: 'exec-1',
      requestId: 'req-1',
      correlationId: 'corr-1',
      clientIpPrefix: '203.0.113.0/24',
      userAgent: 'test-agent',
      decision: event.decision,
      details: event.details,
      detailsRedacted: true,
    });
    expect(row?.occurredAt.toISOString()).toBe(event.timestamp);
    expect(row?.recordedAt).toBeInstanceOf(Date);
  });

  it('uses the configured default tenant for events without a tenantId', async () => {
    const tenantId = randomUUID();
    const client = new AuditClient(createPostgresAuditStore(runtime.tenantDb, { defaultTenantId: tenantId }), {
      production: true,
    });
    await client.logEvent({ action: 'PATIENT_READ', actorType: 'system', actorId: 'worker-1', outcome: 'SUCCESS' });
    expect(await rowsOf(tenantId)).toHaveLength(1);
  });

  it('refuses an event with no tenant and no default (fail closed)', async () => {
    const client = new AuditClient(createPostgresAuditStore(runtime.tenantDb), { production: true });
    await expect(
      client.logEvent({ action: 'PATIENT_READ', actorType: 'system', actorId: 'worker-1', outcome: 'SUCCESS' }),
    ).rejects.toBeInstanceOf(AuditTenantMissingError);
  });

  it('keeps a tenant from reading another tenant\'s audit events', async () => {
    const a = randomUUID();
    const b = randomUUID();
    const client = new AuditClient(createPostgresAuditStore(runtime.tenantDb), { production: true });
    await client.logEvent(iamEvent('auth.login', { actorType: 'user', actorId: 'u-a', tenantId: a, outcome: 'SUCCESS' }, { mfa: true }));
    expect(await rowsOf(a)).toHaveLength(1);
    expect(await rowsOf(b)).toHaveLength(0);
  });

  it('stores the truncated client address and never the raw one', async () => {
    const tenantId = randomUUID();
    const client = new AuditClient(createPostgresAuditStore(runtime.tenantDb), { production: true });
    await client.logEvent({
      action: 'auth.login',
      actorType: 'user',
      actorId: 'u-1',
      tenantId,
      outcome: 'SUCCESS',
      clientIp: '203.0.113.57',
    });
    const rows = await rowsOf(tenantId);
    expect(rows[0]?.clientIpPrefix).toBe('203.0.113.0/24');
    expect(JSON.stringify(rows)).not.toContain('203.0.113.57');
  });

  it('propagates a database failure as a DatabaseError without the event values', async () => {
    const tenantId = randomUUID();
    const store = createPostgresAuditStore(runtime.tenantDb);
    // gate outside 1..5 violates the CHECK constraint
    const error = await store
      .save({
        action: 'CANARY-ACTION',
        actorType: 'user',
        actorId: 'CANARY-ACTOR',
        tenantId,
        outcome: 'DENIED',
        gate: 9 as never,
        details: { note: 'CANARY-DETAIL' },
        timestamp: new Date().toISOString(),
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DatabaseError);
    expect(error).toMatchObject({ sqlState: '23514', constraint: 'audit_events_gate_check' });
    expect(JSON.stringify({ message: (error as Error).message, own: Object.entries(error as object) })).not.toContain('CANARY');
    expect(await rowsOf(tenantId)).toHaveLength(0);
  });
});
