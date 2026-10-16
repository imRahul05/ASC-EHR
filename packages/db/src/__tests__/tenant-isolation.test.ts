/**
 * Tenant isolation and least-privilege runtime role behaviour, proven as the
 * RUNTIME role (the one the app uses): not the table owner, no superuser, no RLS
 * bypass. Isolation is enforced via parameterized query filters in
 * createPostgresAgentRunStore (ADR 2026-10-14).
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
    runtime.tenantDb.withTenant(tenant, async (tx) => (await tx.execute(sql`SELECT 1 FROM agent_runs WHERE tenant_id = ${tenant}`)).length);

  describe('between tenants', () => {
    it('a tenant sees only its own rows via parameterized filtering', async () => {
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

    it('an execution id owned by another tenant cannot be claimed by tenant B', async () => {
      const a = createPostgresAgentRunStore(runtime.tenantDb, { tenantId: TENANT_A });
      const b = createPostgresAgentRunStore(runtime.tenantDb, { tenantId: TENANT_B });
      await a.begin(start, stale);
      const result = await b.begin(start, stale);
      expect(result.claimed).toBe(false);
      expect(await a.get('job-1')).toMatchObject({ status: 'running', claim: 1 });
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

  describe('tenant parameter validation', () => {
    it('rejects invalid or empty tenant id', async () => {
      await expect(runtime.tenantDb.withTenant('', () => Promise.resolve())).rejects.toThrow('tenantId must be a UUID');
      await expect(runtime.tenantDb.withTenant('invalid-uuid', () => Promise.resolve())).rejects.toThrow('tenantId must be a UUID');
    });
  });

  describe('runtime role limits', () => {
    const refused = (statement: string) => expect(runtime.client.unsafe(statement)).rejects.toThrow(/must be owner|permission denied/);

    it('connects as asc_app, not as a superuser and not as the table owner', async () => {
      const rows = await runtime.client`SELECT current_user AS role, r.rolsuper, r.rolbypassrls,
          (SELECT tableowner FROM pg_tables WHERE schemaname = current_schema() AND tablename = 'agent_runs') AS owner
        FROM pg_roles r WHERE r.rolname = current_user`;
      expect(rows[0]).toMatchObject({ role: 'asc_app', rolsuper: false, rolbypassrls: false });
      expect(rows[0]?.owner).not.toBe('asc_app');
    });

    it('cannot alter the table or create tables', async () => {
      await refused('ALTER TABLE agent_runs ADD COLUMN x text');
      await refused('ALTER TABLE agent_runs DISABLE ROW LEVEL SECURITY');
      await refused('ALTER TABLE agent_runs NO FORCE ROW LEVEL SECURITY');
      await refused('DROP TABLE agent_runs');
      await refused('CREATE TABLE sneaky (id int)');
    });

    it('cannot delete or truncate agent_runs', async () => {
      await refused('DELETE FROM agent_runs');
      await refused('TRUNCATE agent_runs');
    });

    it('cannot change role or session authorization to table owner', async () => {
      const owner = await t.client`SELECT tableowner FROM pg_tables WHERE schemaname = current_schema() AND tablename = 'agent_runs'`;
      await refused(`SET ROLE "${owner[0]?.tableowner as string}"`);
      await refused(`SET SESSION AUTHORIZATION "${owner[0]?.tableowner as string}"`);
    });
  });
});

