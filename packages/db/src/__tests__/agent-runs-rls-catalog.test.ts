/**
 * Catalog check: row-level security on agent_runs is disabled per ADR 2026-10-14
 * (migration 0007_streamline_single_facility_access.sql) to prevent session-variable
 * connection pool pinning on Neon / PgBouncer. Defense-in-depth isolation is
 * enforced via parameterized query filters in createPostgresAgentRunStore.
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

  it('disables session-variable row-level security per ADR 2026-10-14', async () => {
    const rows = await t.client`SELECT relrowsecurity, relforcerowsecurity FROM pg_class
      WHERE oid = 'agent_runs'::regclass`;
    expect(rows[0]).toEqual({ relrowsecurity: false, relforcerowsecurity: false });
  });

  it('has no session-variable tenant_isolation policy per ADR 2026-10-14', async () => {
    const rows = await t.client`SELECT polname, polcmd, polpermissive
      FROM pg_policy WHERE polrelid = 'agent_runs'::regclass`;
    expect(rows).toHaveLength(0);
  });
});
