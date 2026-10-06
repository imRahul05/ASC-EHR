/**
 * Tenant isolation and fail-closed behaviour, proven as the RUNTIME role (the one
 * the app uses): not the table owner, no RLS bypass. Needs a live Postgres with
 * the local runtime login (see packages/db/README.md).
 */

import type { AgentRunStart } from '@asc/agents';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPostgresAgentRunStore } from '../agent-run-store.js';
import { connectRuntime, createTestSchema, runtimeUrl, type RuntimeAccess, type TestSchema } from './test-db.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

const TENANT_A = '0b8f3c52-6f3e-4a77-9a55-3d6e1f0c2a10';
const TENANT_B = '7d1e9a64-2c0b-4e58-8f3a-91b2c4d5e6f7';
const start: AgentRunStart = { executionId: 'job-1', agent: 'test-agent', promptVersion: '2026-01-01.1', containsPhi: true };
const stale = { staleAfterMs: 60_000 };

describeDb(TEST_DATABASE_URL ? 'tenant isolation (runtime role)' : 'tenant isolation (SKIPPED: set TEST_DATABASE_URL)', () => {
  let t: TestSchema;
  let runtime: RuntimeAccess;

  const insertRaw = (tenant: string, executionId: string) => sql`
    INSERT INTO agent_runs (execution_id, agent, prompt_version, status, claim, contains_phi, tenant_id, created_at, started_at, updated_at)
    VALUES (${executionId}, 'a', 'v1', 'running', 1, false, ${tenant}, now(), now(), now())`;

  beforeAll(async () => {
    const url = TEST_DATABASE_URL as string;
    t = await createTestSchema(url, 'test_tenant_isolation');
    runtime = connectRuntime(runtimeUrl(url, process.env.TEST_RUNTIME_DATABASE_URL), t.schemaName);
  });
  afterAll(async () => {
    await runtime?.close();
    await t?.drop();
  });
  beforeEach(async () => {
    await t.db.execute(sql`TRUNCATE agent_runs`);
  });

  const count = (tenant: string) =>
    runtime.tenantDb.withTenant(tenant, async (tx) => (await tx.execute(sql`SELECT 1 FROM agent_runs`)).length);

  describe('between tenants', () => {
    it('a tenant sees only its own rows', async () => {
      await runtime.tenantDb.withTenant(TENANT_A, (tx) => tx.execute(insertRaw(TENANT_A, 'a-1')));
      await runtime.tenantDb.withTenant(TENANT_B, (tx) => tx.execute(insertRaw(TENANT_B, 'b-1')));
      expect(await count(TENANT_A)).toBe(1);
      expect(await count(TENANT_B)).toBe(1);
    });

    it('the run store of tenant B cannot read, claim or finish a run of tenant A', async () => {
      const a = createPostgresAgentRunStore(runtime.tenantDb, { tenantId: TENANT_A });
      const b = createPostgresAgentRunStore(runtime.tenantDb, { tenantId: TENANT_B });
      await a.begin(start, stale);
      expect(await b.get('job-1')).toBeUndefined();
      expect(await b.succeed('job-1', { claim: 1, output: {}, meta: {} as never })).toBe(false);
      expect(await b.fail('job-1', { claim: 1, failureKind: 'provider', errorName: 'E' })).toBe(false);
      expect(await a.get('job-1')).toMatchObject({ status: 'running', claim: 1 });
    });

    it('a write for another tenant is rejected (WITH CHECK)', async () => {
      await expect(runtime.tenantDb.withTenant(TENANT_A, (tx) => tx.execute(insertRaw(TENANT_B, 'x')))).rejects.toThrow();
      expect(await count(TENANT_B)).toBe(0);
    });

    it('a tenant cannot hand its row to another tenant by updating tenant_id', async () => {
      await runtime.tenantDb.withTenant(TENANT_A, (tx) => tx.execute(insertRaw(TENANT_A, 'a-1')));
      await expect(
        runtime.tenantDb.withTenant(TENANT_A, (tx) => tx.execute(sql`UPDATE agent_runs SET tenant_id = ${TENANT_B}`)),
      ).rejects.toThrow();
      expect(await count(TENANT_A)).toBe(1);
    });

    it('another tenant updates zero rows', async () => {
      await runtime.tenantDb.withTenant(TENANT_A, (tx) => tx.execute(insertRaw(TENANT_A, 'a-1')));
      const updated = await runtime.tenantDb.withTenant(TENANT_B, (tx) =>
        tx.execute(sql`UPDATE agent_runs SET agent = 'hijacked' RETURNING execution_id`),
      );
      expect(updated).toHaveLength(0);
    });

    it('an execution id owned by another tenant cannot be claimed, and nothing of it is returned', async () => {
      const a = createPostgresAgentRunStore(runtime.tenantDb, { tenantId: TENANT_A });
      const b = createPostgresAgentRunStore(runtime.tenantDb, { tenantId: TENANT_B });
      await a.begin(start, stale);
      // The primary key is still global (open question in the plan): tenant B's insert collides
      // with a row it cannot see, so begin finds nothing to claim and fails. It must not claim,
      // overwrite or reveal the row.
      const error = await b.begin(start, stale).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/vanished during begin/);
      expect(await a.get('job-1')).toMatchObject({ status: 'running', claim: 1 });
      expect(await count(TENANT_B)).toBe(0);
    });

    it('a different facility of the same tenant does not take over a run', async () => {
      const f1 = createPostgresAgentRunStore(runtime.tenantDb, { tenantId: TENANT_A, facilityId: 'facility-1' });
      const f2 = createPostgresAgentRunStore(runtime.tenantDb, { tenantId: TENANT_A, facilityId: 'facility-2' });
      await f1.begin(start, stale);
      await f1.fail('job-1', { claim: 1, failureKind: 'provider', errorName: 'E' });
      expect(await f2.begin(start, stale)).toMatchObject({ claimed: false, record: { status: 'failed', claim: 1 } });
      expect(await f1.begin(start, stale)).toMatchObject({ claimed: true, record: { claim: 2 } });
    });
  });

  describe('missing tenant context (fail closed)', () => {
    beforeEach(async () => {
      await runtime.tenantDb.withTenant(TENANT_A, (tx) => tx.execute(insertRaw(TENANT_A, 'a-1')));
    });

    it('no app.tenant_id set: zero rows', async () => {
      expect(await runtime.client`SELECT 1 FROM agent_runs`).toHaveLength(0);
    });

    it('an empty app.tenant_id: zero rows', async () => {
      const rows = await runtime.client.begin(async (tx) => {
        await tx`SELECT set_config('app.tenant_id', '', true)`;
        return tx`SELECT 1 FROM agent_runs`;
      });
      expect(rows).toHaveLength(0);
    });

    it('no app.tenant_id set: insert is rejected', async () => {
      await expect(
        runtime.client`INSERT INTO agent_runs (execution_id, agent, prompt_version, status, claim, contains_phi, tenant_id, created_at, started_at, updated_at)
          VALUES ('x', 'a', 'v1', 'running', 1, false, ${TENANT_A}, now(), now(), now())`,
      ).rejects.toThrow(/row-level security/);
    });

    it('no app.tenant_id set: update and delete touch nothing or are refused', async () => {
      expect(await runtime.client`UPDATE agent_runs SET agent = 'x' RETURNING execution_id`).toHaveLength(0);
      await expect(runtime.client`DELETE FROM agent_runs`).rejects.toThrow(/permission denied/);
      expect(await count(TENANT_A)).toBe(1);
    });
  });

  describe('runtime role limits', () => {
    const refused = (statement: string) => expect(runtime.client.unsafe(statement)).rejects.toThrow(/must be owner|permission denied|row-level security/);

    it('connects as asc_app, not as a superuser and not as the table owner', async () => {
      const rows = await runtime.client`SELECT current_user AS role, r.rolsuper, r.rolbypassrls,
          (SELECT tableowner FROM pg_tables WHERE schemaname = current_schema() AND tablename = 'agent_runs') AS owner
        FROM pg_roles r WHERE r.rolname = current_user`;
      expect(rows[0]).toMatchObject({ role: 'asc_app', rolsuper: false, rolbypassrls: false });
      expect(rows[0]?.owner).not.toBe('asc_app');
    });

    it('cannot alter the table, turn RLS off, drop the policy or create tables', async () => {
      await refused('ALTER TABLE agent_runs ADD COLUMN x text');
      await refused('ALTER TABLE agent_runs DISABLE ROW LEVEL SECURITY');
      await refused('ALTER TABLE agent_runs NO FORCE ROW LEVEL SECURITY');
      await refused('DROP POLICY tenant_isolation ON agent_runs');
      await refused('DROP TABLE agent_runs');
      await refused('CREATE TABLE sneaky (id int)');
    });

    it('cannot delete or truncate agent_runs', async () => {
      await refused('DELETE FROM agent_runs');
      await refused('TRUNCATE agent_runs');
    });

    it('cannot bypass RLS by turning row_security off or by changing role', async () => {
      await runtime.tenantDb.withTenant(TENANT_A, (tx) => tx.execute(insertRaw(TENANT_A, 'a-1')));
      await expect(
        runtime.client.begin(async (tx) => {
          await tx.unsafe('SET LOCAL row_security = off');
          return tx.unsafe('SELECT * FROM agent_runs');
        }),
      ).rejects.toThrow(/row-level security/);
      const owner = await t.client`SELECT tableowner FROM pg_tables WHERE schemaname = current_schema() AND tablename = 'agent_runs'`;
      await refused(`SET ROLE "${owner[0]?.tableowner as string}"`);
      await refused(`SET SESSION AUTHORIZATION "${owner[0]?.tableowner as string}"`);
    });
  });
});
