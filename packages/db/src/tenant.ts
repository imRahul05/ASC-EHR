/**
 * Tenant-scoped database access. `@asc/db` exposes only `withTenant`: there is no
 * exported client without a tenant context. Every call runs in one transaction
 * scoped to the tenant (ADR 2026-10-14); queries filter directly by parameters.
 *
 * Database failures surface as `DatabaseError` (SQLSTATE and constraint only), never
 * with query parameters or row values.
 *
 * The URL must be the RUNTIME role (`DATABASE_RUNTIME_URL`): not the table owner,
 * cannot alter tables. The tenant id comes from the principal or
 * job context, never from a request body or query string.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { toSafeDbError } from './db-error.js';
import * as schema from './schema/index.js';

type Database = ReturnType<typeof drizzle<typeof schema>>;

/** Drizzle transaction handle, valid only inside `withTenant`. */
export type TenantTx = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface TenantDbClient {
  transaction<T>(fn: (tx: TenantTx) => Promise<T>): Promise<T>;
}

export interface TenantDb {
  /** Runs `fn` in a transaction scoped to `tenantId`. Rejects a tenant id that is not a UUID. */
  withTenant<T>(tenantId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T>;
}

export interface CreateTenantDbOptions {
  /** Runtime-role Postgres URL (`DATABASE_RUNTIME_URL`). Deployed environments must use TLS. */
  url: string;
  /** Max pool connections (default 10). */
  max?: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Wraps an existing drizzle instance. Internal: the package entry point only offers `createTenantDb`. */
export function wrapTenantDb(db: Database | TenantDbClient): TenantDb {
  return {
    async withTenant(tenantId, fn) {
      // Never echo the value: a bad id may be attacker-controlled or sensitive.
      if (!UUID.test(tenantId)) throw new Error('tenantId must be a UUID');
      try {
        return await db.transaction(async (tx) => fn(tx));
      } catch (error) {
        // Driver errors carry bound values (PHI in agent_runs.output): hand callers a DatabaseError.
        throw toSafeDbError(error);
      }
    },
  };
}

export function createTenantDb({ url, max = 10 }: CreateTenantDbOptions): TenantDb & { close: () => Promise<void> } {
  // postgres.js logs server notices with console.log by default; drop them (no console in app code).
  const client = postgres(url, { max, onnotice: () => {} });
  return {
    ...wrapTenantDb(drizzle(client, { schema })),
    /** Drains the pool. Call on shutdown. */
    close: () => client.end({ timeout: 5 }),
  };
}
