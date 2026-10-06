/**
 * withTenant: sets a transaction-local tenant, validates the id, never leaks the
 * setting into the pool.
 */

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { TenantTx } from '../tenant.js';
import { connectRuntime, createTestSchema, runtimeUrl, type RuntimeAccess, type TestSchema } from './test-db.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

const TENANT_A = '0b8f3c52-6f3e-4a77-9a55-3d6e1f0c2a10';

describeDb(TEST_DATABASE_URL ? 'withTenant' : 'withTenant (SKIPPED: set TEST_DATABASE_URL)', () => {
  let t: TestSchema;
  let runtime: RuntimeAccess;

  beforeAll(async () => {
    const url = TEST_DATABASE_URL as string;
    t = await createTestSchema(url, 'test_with_tenant');
    runtime = connectRuntime(runtimeUrl(url, process.env.TEST_RUNTIME_DATABASE_URL), t.schemaName);
  });
  afterAll(async () => {
    await runtime?.close();
    await t?.drop();
  });

  const currentTenant = (tx: TenantTx) => tx.execute<{ tenant: string | null }>(sql`SELECT current_setting('app.tenant_id', true) AS tenant`);

  it('sets app.tenant_id inside the transaction', async () => {
    const rows = await runtime.tenantDb.withTenant(TENANT_A, (tx) => currentTenant(tx));
    expect(rows[0]?.tenant).toBe(TENANT_A);
  });

  it('does not leak the tenant into the next use of the pool', async () => {
    await runtime.tenantDb.withTenant(TENANT_A, (tx) => currentTenant(tx));
    const rows = await runtime.client`SELECT current_setting('app.tenant_id', true) AS tenant`;
    expect(rows[0]?.tenant ?? '').toBe('');
  });

  it('rejects a tenant id that is not a UUID without echoing it or touching the database', async () => {
    const hostile = "x'; DROP TABLE agent_runs; --";
    await expect(runtime.tenantDb.withTenant(hostile, () => Promise.resolve())).rejects.toThrow('tenantId must be a UUID');
    const error = await runtime.tenantDb.withTenant(hostile, () => Promise.resolve()).catch((e: unknown) => e);
    expect((error as Error).message).not.toContain('DROP');
    await expect(runtime.tenantDb.withTenant('', () => Promise.resolve())).rejects.toThrow('tenantId must be a UUID');
  });

  it('rolls back when the callback throws', async () => {
    await expect(
      runtime.tenantDb.withTenant(TENANT_A, async (tx) => {
        await tx.execute(
          sql`INSERT INTO agent_runs (execution_id, agent, prompt_version, status, claim, contains_phi, tenant_id, created_at, started_at, updated_at)
              VALUES ('rollback-1', 'a', 'v1', 'running', 1, false, ${TENANT_A}, now(), now(), now())`,
        );
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const rows = await runtime.tenantDb.withTenant(TENANT_A, (tx) =>
      tx.execute(sql`SELECT 1 FROM agent_runs WHERE execution_id = 'rollback-1'`),
    );
    expect(rows).toHaveLength(0);
  });
});
