import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestSchema, type TestSchema } from './test-db.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

describeDb(TEST_DATABASE_URL ? 'agent_runs tenancy columns' : 'agent_runs tenancy columns (SKIPPED: set TEST_DATABASE_URL)', () => {
  let t: TestSchema;
  beforeAll(async () => {
    t = await createTestSchema(TEST_DATABASE_URL as string, 'test_tenancy_columns');
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('has tenant_id (uuid) and facility_id (text), and keeps legacy org_id', async () => {
    const rows = await t.db.execute<{ column_name: string; data_type: string }>(sql`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'agent_runs'
        AND column_name IN ('tenant_id', 'facility_id', 'org_id') ORDER BY column_name`);
    expect(rows.map((r) => [r.column_name, r.data_type])).toEqual([
      ['facility_id', 'text'],
      ['org_id', 'text'],
      ['tenant_id', 'uuid'],
    ]);
  });
});
