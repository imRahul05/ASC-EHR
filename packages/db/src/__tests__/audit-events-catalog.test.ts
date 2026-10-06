/**
 * Catalog check for audit_events: tenant RLS enabled and forced, append-only
 * policies, grants and triggers. Behaviour (rejected UPDATE/DELETE) is proven in
 * audit-store.test.ts.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestSchema, type TestSchema } from './test-db.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

describeDb(TEST_DATABASE_URL ? 'audit_events catalog' : 'audit_events catalog (SKIPPED: set TEST_DATABASE_URL)', () => {
  let t: TestSchema;
  beforeAll(async () => {
    t = await createTestSchema(TEST_DATABASE_URL as string, 'test_audit_catalog');
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('enables and forces row-level security', async () => {
    const rows = await t.client`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'audit_events'::regclass`;
    expect(rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });

  it('has a read policy and an insert policy on app.tenant_id, and none for update or delete', async () => {
    const rows = await t.client<{ polname: string; polcmd: string; using_expr: string; check_expr: string }[]>`SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr,
        pg_get_expr(polwithcheck, polrelid) AS check_expr
      FROM pg_policy WHERE polrelid = 'audit_events'::regclass ORDER BY polname`;
    expect(rows.map((r) => [r.polname, r.polcmd])).toEqual([
      ['tenant_append', 'a'],
      ['tenant_read', 'r'],
    ]);
    expect(rows.find((r) => r.polname === 'tenant_read')?.using_expr).toContain('app.tenant_id');
    expect(rows.find((r) => r.polname === 'tenant_append')?.check_expr).toContain('app.tenant_id');
  });

  it('grants the runtime role SELECT and INSERT only, and PUBLIC nothing', async () => {
    const rows = await t.client<{ privilege: string; granted: boolean }[]>`SELECT p AS privilege, has_table_privilege('asc_runtime', 'audit_events', p) AS granted
      FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) AS p`;
    expect(Object.fromEntries(rows.map((r) => [r.privilege, r.granted]))).toEqual({
      SELECT: true,
      INSERT: true,
      UPDATE: false,
      DELETE: false,
      TRUNCATE: false,
      REFERENCES: false,
      TRIGGER: false,
    });
    const publicGrants = await t.client`SELECT 1 FROM information_schema.role_table_grants
      WHERE table_schema = current_schema() AND table_name = 'audit_events' AND grantee = 'PUBLIC'`;
    expect(publicGrants).toHaveLength(0);
  });

  it('has triggers that reject UPDATE and DELETE per row and TRUNCATE per statement', async () => {
    const rows = await t.client<{ tgname: string; tgtype: number }[]>`SELECT tgname, tgtype FROM pg_trigger
      WHERE tgrelid = 'audit_events'::regclass AND NOT tgisinternal ORDER BY tgname`;
    expect(rows.map((r) => r.tgname)).toEqual(['audit_events_no_truncate', 'audit_events_no_update_delete']);
    const flags = Object.fromEntries(rows.map((r) => [r.tgname, r.tgtype]));
    const ROW = 1;
    const BEFORE = 2;
    const DELETE = 8;
    const UPDATE = 16;
    const TRUNCATE = 32;
    expect(flags.audit_events_no_update_delete).toBe(ROW | BEFORE | DELETE | UPDATE);
    expect(flags.audit_events_no_truncate).toBe(BEFORE | TRUNCATE);
  });
});
