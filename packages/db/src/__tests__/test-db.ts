/**
 * Shared setup for the Postgres integration tests. Each suite migrates into its
 * own throwaway schema and drops it afterwards. Each `*.test.ts` reads
 * TEST_DATABASE_URL itself (only test files may touch process.env) and skips
 * its suite without it, so `pnpm test` stays green without a database.
 */

import { randomUUID } from 'node:crypto';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { runMigrations, type Db } from '../migrate.js';
import * as schema from '../schema/index.js';
import { wrapTenantDb, type TenantDb } from '../tenant.js';

export interface TestSchema {
  schemaName: string;
  /** Owner connection (table owner / migrations role) pinned to the throwaway schema. */
  client: postgres.Sql;
  db: Db;
  drop: () => Promise<void>;
}

export async function createTestSchema(url: string, prefix: string, options: { migrate?: boolean } = {}): Promise<TestSchema> {
  const schemaName = `${prefix}_${randomUUID().replaceAll('-', '')}`;
  const admin = postgres(url, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE SCHEMA "${schemaName}"`);
  await admin.end();

  const client = postgres(url, { max: 20, onnotice: () => {}, connection: { search_path: schemaName } });
  const db = drizzle(client, { schema });
  if (options.migrate !== false) await runMigrations(db, { migrationsSchema: schemaName });
  return {
    schemaName,
    client,
    db,
    drop: async () => {
      await client.unsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await client.end();
    },
  };
}

/**
 * Runtime-role URL: the owner URL with the local runtime login (see
 * docker/postgres/init/01-runtime-role.sql). An explicit URL wins.
 */
export function runtimeUrl(ownerUrl: string, explicit?: string): string {
  if (explicit) return explicit;
  const url = new URL(ownerUrl);
  url.username = 'asc_app';
  url.password = 'asc_app';
  return url.toString();
}

export interface RuntimeAccess {
  /** Tenant-scoped access, as the app gets it. */
  tenantDb: TenantDb;
  /** Raw runtime-role connection (no tenant context) for attack and missing-context cases. */
  client: postgres.Sql;
  close: () => Promise<void>;
}

/** Connects as the runtime role, pinned to the throwaway schema. */
export function connectRuntime(url: string, schemaName: string): RuntimeAccess {
  const client = postgres(url, { max: 20, onnotice: () => {}, connection: { search_path: schemaName } });
  return { tenantDb: wrapTenantDb(drizzle(client, { schema })), client, close: () => client.end({ timeout: 5 }) };
}
