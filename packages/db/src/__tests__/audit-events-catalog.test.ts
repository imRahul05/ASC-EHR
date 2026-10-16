/**
 * Catalog check for audit_events: RLS disabled per ADR 2026-10-14 (migration 0007),
 * while append-only grants and triggers remain strictly enforced.
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

  it('disables session-variable row-level security per ADR 2026-10-14', async () => {
    const rows = await t.client`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'audit_events'::regclass`;
    expect(rows[0]).toEqual({ relrowsecurity: false, relforcerowsecurity: false });
  });

  it('has no session-variable tenant policies per ADR 2026-10-14', async () => {
    const rows = await t.client<{ polname: string }[]>`SELECT polname FROM pg_policy WHERE polrelid = 'audit_events'::regclass`;
    expect(rows).toHaveLength(0);
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
