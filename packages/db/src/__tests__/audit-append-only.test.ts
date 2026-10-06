/**
 * audit_events is append-only. Proven twice: the runtime role has no UPDATE,
 * DELETE or TRUNCATE (permission denied), and a trigger rejects them for the
 * table owner too (mistakes). Also: tenant isolation and missing context.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresAuditStore } from '../audit-store.js';
import { connectRuntime, createTestSchema, runtimeUrl, type RuntimeAccess, type TestSchema } from './test-db.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

describeDb(TEST_DATABASE_URL ? 'audit_events is append-only' : 'audit_events is append-only (SKIPPED: set TEST_DATABASE_URL)', () => {
  let t: TestSchema;
  let runtime: RuntimeAccess;
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();

  /** Runs raw SQL as the runtime role inside a transaction that sets the tenant. */
  const asRuntime = (tenant: string, statement: string) =>
    runtime.client.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenant}, true)`;
      return tx.unsafe(statement);
    });

  /** Same for the table owner (FORCE RLS applies to the owner too). */
  const asOwner = (tenant: string, statement: string) =>
    t.client.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenant}, true)`;
      return tx.unsafe(statement);
    });

  const snapshot = async () =>
    (await asOwner(tenantId, 'SELECT id, action, actor_id, outcome FROM audit_events ORDER BY id')).map((r) => ({ ...r }));

  beforeAll(async () => {
    const url = TEST_DATABASE_URL as string;
    t = await createTestSchema(url, 'test_audit_append_only');
    runtime = connectRuntime(runtimeUrl(url, process.env.TEST_RUNTIME_DATABASE_URL), t.schemaName);
    const store = createPostgresAuditStore(runtime.tenantDb);
    for (const actorId of ['u-1', 'u-2']) {
      await store.save({
        action: 'auth.login',
        actorType: 'user',
        actorId,
        tenantId,
        outcome: 'SUCCESS',
        timestamp: new Date().toISOString(),
      });
    }
  });
  afterAll(async () => {
    await runtime?.close();
    await t?.drop();
  });

  describe('runtime role', () => {
    it('cannot UPDATE, DELETE or TRUNCATE (permission denied), even in its own tenant', async () => {
      const before = await snapshot();
      await expect(asRuntime(tenantId, "UPDATE audit_events SET outcome = 'FAILURE'")).rejects.toThrow(/permission denied/);
      await expect(asRuntime(tenantId, 'DELETE FROM audit_events')).rejects.toThrow(/permission denied/);
      await expect(asRuntime(tenantId, 'TRUNCATE audit_events')).rejects.toThrow(/permission denied/);
      expect(await snapshot()).toEqual(before);
    });

    it('cannot rewrite history through INSERT ... ON CONFLICT DO UPDATE', async () => {
      const before = await snapshot();
      const id = before[0]?.id as string;
      await expect(
        asRuntime(
          tenantId,
          `INSERT INTO audit_events (id, tenant_id, occurred_at, action, actor_type, actor_id, outcome)
           VALUES ('${id}', '${tenantId}', now(), 'forged', 'user', 'u-x', 'SUCCESS')
           ON CONFLICT (id) DO UPDATE SET action = 'forged'`,
        ),
      ).rejects.toThrow(/permission denied/);
      expect(await snapshot()).toEqual(before);
    });

    it('cannot drop or disable the triggers, or alter the table', async () => {
      await expect(asRuntime(tenantId, 'ALTER TABLE audit_events DISABLE TRIGGER ALL')).rejects.toThrow(/must be owner|permission denied/);
      await expect(asRuntime(tenantId, 'DROP TRIGGER audit_events_no_update_delete ON audit_events')).rejects.toThrow(
        /must be owner|permission denied/,
      );
      await expect(asRuntime(tenantId, 'ALTER TABLE audit_events DISABLE ROW LEVEL SECURITY')).rejects.toThrow(/must be owner|permission denied/);
    });
  });

  describe('table owner (trigger)', () => {
    it('cannot UPDATE a row', async () => {
      const before = await snapshot();
      await expect(asOwner(tenantId, "UPDATE audit_events SET outcome = 'FAILURE'")).rejects.toThrow(/append-only: UPDATE/);
      expect(await snapshot()).toEqual(before);
    });

    it('cannot DELETE a row', async () => {
      const before = await snapshot();
      await expect(asOwner(tenantId, 'DELETE FROM audit_events')).rejects.toThrow(/append-only: DELETE/);
      expect(await snapshot()).toEqual(before);
    });

    it('cannot TRUNCATE the table', async () => {
      const before = await snapshot();
      await expect(t.client.unsafe('TRUNCATE audit_events')).rejects.toThrow(/append-only: TRUNCATE/);
      expect(await snapshot()).toEqual(before);
    });
  });

  describe('tenant isolation and missing context', () => {
    it('another tenant sees nothing and cannot write into this tenant', async () => {
      expect(await asRuntime(otherTenantId, 'SELECT 1 FROM audit_events')).toHaveLength(0);
      await expect(
        asRuntime(
          otherTenantId,
          `INSERT INTO audit_events (tenant_id, occurred_at, action, actor_type, actor_id, outcome)
           VALUES ('${tenantId}', now(), 'x', 'user', 'u', 'SUCCESS')`,
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it('no tenant context: no rows, and inserts are rejected', async () => {
      expect(await runtime.client`SELECT 1 FROM audit_events`).toHaveLength(0);
      await expect(
        runtime.client`INSERT INTO audit_events (tenant_id, occurred_at, action, actor_type, actor_id, outcome)
          VALUES (${tenantId}, now(), 'x', 'user', 'u', 'SUCCESS')`,
      ).rejects.toThrow(/row-level security/);
      expect(await snapshot()).toHaveLength(2);
    });
  });
});
