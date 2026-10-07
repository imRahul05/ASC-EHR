import { configureAuditStore, createAuditClient } from "@asc/audit";
import { createPostgresAuditStore } from "@asc/db";
import type { TenantDb } from "@asc/db";

/**
 * The audit client the API records denials with. With a runtime database it is the
 * durable, append-only Postgres store (also injected into the shared default client,
 * so any package using `auditClient` writes to it). Without one, development falls
 * back to the log-channel store, and a production or staging process refuses to start:
 * `createAuditClient` throws unless the store is durable and append-only.
 */
export function buildAuditClient(options: { production: boolean; tenantDb?: TenantDb; defaultTenantId: string }) {
  const store =
    options.tenantDb === undefined
      ? undefined
      : createPostgresAuditStore(options.tenantDb, { defaultTenantId: options.defaultTenantId });
  const client = createAuditClient(store, { production: options.production });
  if (store !== undefined) configureAuditStore(store);
  return client;
}
