/** createMigrationDb hands the configured tenant to the session for the backfill migration. */

import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { createMigrationDb } from '../migrate.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const itDb = TEST_DATABASE_URL ? it : it.skip;

const TENANT_ID = '0b8f3c52-6f3e-4a77-9a55-3d6e1f0c2a10';

describe('createMigrationDb', () => {
  itDb('sets app.default_tenant_id on the session when a default tenant is given', async () => {
    const migration = createMigrationDb({ url: TEST_DATABASE_URL as string, defaultTenantId: TENANT_ID, max: 1 });
    try {
      const rows = await migration.db.execute<{ tenant: string }>(sql`SELECT current_setting('app.default_tenant_id') AS tenant`);
      expect(rows[0]?.tenant).toBe(TENANT_ID);
    } finally {
      await migration.close();
    }
  });

  itDb('leaves it unset otherwise', async () => {
    const migration = createMigrationDb({ url: TEST_DATABASE_URL as string, max: 1 });
    try {
      const rows = await migration.db.execute<{ tenant: string | null }>(sql`SELECT current_setting('app.default_tenant_id', true) AS tenant`);
      expect(rows[0]?.tenant ?? '').toBe('');
    } finally {
      await migration.close();
    }
  });
});
