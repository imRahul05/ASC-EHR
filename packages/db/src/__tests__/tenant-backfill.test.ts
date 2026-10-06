/**
 * Contract migration: rows written before tenancy get the configured tenant, and
 * tenant_id becomes NOT NULL. The migrator applies every file in one go, so this
 * test applies the SQL files itself to put a legacy row in between.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MIGRATIONS_FOLDER } from '../client.js';
import { createTestSchema, type TestSchema } from './test-db.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

const TENANT_ID = '0b8f3c52-6f3e-4a77-9a55-3d6e1f0c2a10';

function migrationStatements(tag: string): string[] {
  return readFileSync(join(MIGRATIONS_FOLDER, `${tag}.sql`), 'utf8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

describeDb(TEST_DATABASE_URL ? 'tenant backfill migration' : 'tenant backfill migration (SKIPPED: set TEST_DATABASE_URL)', () => {
  let t: TestSchema;

  async function freshLegacyTable() {
    await t.client.unsafe('DROP TABLE IF EXISTS agent_runs');
    for (const tag of ['0000_init_agent_runs', '0001_add_tenant_facility_to_agent_runs']) {
      for (const statement of migrationStatements(tag)) await t.client.unsafe(statement);
    }
    await t.client.unsafe(`INSERT INTO agent_runs
      (execution_id, agent, prompt_version, status, claim, contains_phi, created_at, started_at, updated_at)
      VALUES ('legacy-1', 'a', 'v1', 'failed', 1, false, now(), now(), now())`);
  }

  /** Applies the contract migration in one transaction; the setting is transaction-local so it cannot leak into the pool. */
  async function applyContract(defaultTenantId?: string) {
    await t.client.begin(async (tx) => {
      if (defaultTenantId) await tx`SELECT set_config('app.default_tenant_id', ${defaultTenantId}, true)`;
      for (const statement of migrationStatements('0002_backfill_tenant_not_null')) await tx.unsafe(statement);
    });
  }

  beforeAll(async () => {
    t = await createTestSchema(TEST_DATABASE_URL as string, 'test_tenant_backfill', { migrate: false });
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('backfills legacy rows with the configured tenant and sets NOT NULL', async () => {
    await freshLegacyTable();
    await applyContract(TENANT_ID);
    const rows = await t.client`SELECT tenant_id FROM agent_runs WHERE execution_id = 'legacy-1'`;
    expect(rows[0]?.tenant_id).toBe(TENANT_ID);
    const col = await t.client`SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'agent_runs' AND column_name = 'tenant_id'`;
    expect(col[0]?.is_nullable).toBe('NO');
  });

  it('refuses to guess: legacy rows and no configured tenant stop the migration', async () => {
    await freshLegacyTable();
    await expect(applyContract()).rejects.toThrow(/without tenant_id/);
    const rows = await t.client`SELECT tenant_id FROM agent_runs WHERE execution_id = 'legacy-1'`;
    expect(rows[0]?.tenant_id).toBeNull();
  });

  it('passes on an empty table without a configured tenant', async () => {
    await freshLegacyTable();
    await t.client.unsafe('DELETE FROM agent_runs');
    await expect(applyContract()).resolves.toBeUndefined();
  });

  it('rejects inserts without tenant_id afterwards', async () => {
    await expect(
      t.client.unsafe(`INSERT INTO agent_runs
        (execution_id, agent, prompt_version, status, claim, contains_phi, created_at, started_at, updated_at)
        VALUES ('x', 'a', 'v1', 'running', 1, false, now(), now(), now())`),
    ).rejects.toThrow(/tenant_id/);
  });
});
