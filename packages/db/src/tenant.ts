/**
 * Tenant-scoped database access. `@asc/db` exposes only `withTenant`: there is no
 * exported client without a tenant context. Every call runs in one transaction
 * that sets `app.tenant_id` (transaction-local, so it cannot leak across pooled
 * connections); row-level security does the filtering.
 *
 * The URL must be the RUNTIME role (`DATABASE_RUNTIME_URL`): not the table owner,
 * cannot alter tables or bypass RLS. The tenant id comes from the principal or
 * job context, never from a request body or query string.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';

import * as schema from './schema/index.js';

type Database = ReturnType<typeof drizzle<typeof schema>>;

/** Drizzle transaction handle, valid only inside `withTenant`. */
export type TenantTx = Parameters<Parameters<Database['transaction']>[0]>[0];

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
export function wrapTenantDb(db: Database): TenantDb {
  return {
    async withTenant(tenantId, fn) {
      // Never echo the value: a bad id may be attacker-controlled or sensitive.
      if (!UUID.test(tenantId)) throw new Error('tenantId must be a UUID');
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
        return fn(tx);
      });
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
