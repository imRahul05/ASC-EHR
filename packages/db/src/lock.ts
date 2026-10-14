/**
 * Facility-level concurrency control in Postgres via transaction-scoped advisory locks.
 * Serializes operations (such as demographic duplicate checking and case scheduling)
 * per facility across multiple API instances.
 *
 * Uses `pg_advisory_xact_lock(hashtext('facility-registration'), hashtext(facilityId))`.
 * Transaction-scoped: automatically released when the transaction commits or aborts,
 * or if the connection is dropped. No orphaned locks.
 */

import { sql } from 'drizzle-orm';
import type { TenantDb } from './tenant.js';

export async function withPostgresFacilityLock<T>(
  tenantDb: TenantDb,
  tenantId: string,
  facilityId: string,
  fn: () => Promise<T>,
  lockNamespace: string = 'facility-registration',
): Promise<T> {
  return tenantDb.withTenant(tenantId, async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${lockNamespace}), hashtext(${facilityId}))`,
    );
    return await fn();
  });
}
