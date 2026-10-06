/**
 * The runtime role (asc_runtime) is least-privilege: no superuser, no RLS
 * bypass, no ownership, and only the grants the run store needs.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestSchema, type TestSchema } from './test-db.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

describeDb(TEST_DATABASE_URL ? 'runtime role' : 'runtime role (SKIPPED: set TEST_DATABASE_URL)', () => {
  let t: TestSchema;
  beforeAll(async () => {
    t = await createTestSchema(TEST_DATABASE_URL as string, 'test_runtime_role');
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('asc_runtime cannot log in, is not a superuser and cannot bypass row-level security', async () => {
    const rows = await t.client`SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
      FROM pg_roles WHERE rolname = 'asc_runtime'`;
    expect(rows[0]).toEqual({
      rolcanlogin: false,
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
      rolcreatedb: false,
    });
  });

  it('asc_runtime owns nothing and has only SELECT, INSERT and UPDATE on agent_runs', async () => {
    const owner = await t.client`SELECT tableowner FROM pg_tables
      WHERE schemaname = current_schema() AND tablename = 'agent_runs'`;
    expect(owner[0]?.tableowner).not.toBe('asc_runtime');
    const privileges = await t.client`SELECT p AS privilege, has_table_privilege('asc_runtime', 'agent_runs', p) AS granted
      FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) AS p`;
    expect(Object.fromEntries(privileges.map((r) => [r.privilege, r.granted]))).toEqual({
      SELECT: true,
      INSERT: true,
      UPDATE: true,
      DELETE: false,
      TRUNCATE: false,
      REFERENCES: false,
      TRIGGER: false,
    });
  });
});
