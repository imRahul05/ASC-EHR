/**
 * Catalog check: row-level security is enabled AND forced on agent_runs, with the
 * fail-closed policy. Behaviour (isolation, missing context) is proven as the
 * runtime role in tenant-isolation.test.ts; the owner here may be a superuser,
 * which bypasses RLS regardless of FORCE.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestSchema, type TestSchema } from './test-db.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

describeDb(TEST_DATABASE_URL ? 'agent_runs RLS catalog' : 'agent_runs RLS catalog (SKIPPED: set TEST_DATABASE_URL)', () => {
  let t: TestSchema;
  beforeAll(async () => {
    t = await createTestSchema(TEST_DATABASE_URL as string, 'test_rls_catalog');
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('enables and forces row-level security', async () => {
    const rows = await t.client`SELECT relrowsecurity, relforcerowsecurity FROM pg_class
      WHERE oid = 'agent_runs'::regclass`;
    expect(rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });

  it('has one tenant_isolation policy for all commands, keyed on app.tenant_id for read and write', async () => {
    const rows = await t.client`SELECT polname, polcmd, polpermissive,
        pg_get_expr(polqual, polrelid) AS using_expr, pg_get_expr(polwithcheck, polrelid) AS check_expr
      FROM pg_policy WHERE polrelid = 'agent_runs'::regclass`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ polname: 'tenant_isolation', polcmd: '*', polpermissive: true });
    expect(rows[0]?.using_expr).toContain('app.tenant_id');
    expect(rows[0]?.check_expr).toContain('app.tenant_id');
  });
});
