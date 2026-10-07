import { AuditStoreNotConfiguredError } from "@asc/audit";
import type { TenantDb } from "@asc/db";
import { describe, expect, it } from "vitest";

import { buildAuditClient } from "./audit-setup.js";

const TENANT_ID = "0b8f3c52-6f3e-4a77-9a55-3d6e1f0c2a10";

/** A tenant-scoped database that records which tenant each write was made for. */
function recordingTenantDb() {
  const tenants: string[] = [];
  const tenantDb: TenantDb = {
    withTenant: (tenantId, fn) => {
      tenants.push(tenantId);
      // The insert goes through a fake transaction that accepts any statement.
      const tx = { insert: () => ({ values: () => Promise.resolve() }) };
      return fn(tx as never);
    },
  };
  return { tenantDb, tenants };
}

describe("buildAuditClient", () => {
  it("refuses to start in production without a database for the durable audit store", () => {
    expect(() => buildAuditClient({ production: true, defaultTenantId: TENANT_ID })).toThrow(AuditStoreNotConfiguredError);
  });

  it("falls back to the log-channel store in development", () => {
    expect(() => buildAuditClient({ production: false, defaultTenantId: TENANT_ID })).not.toThrow();
  });

  it("accepts the Postgres store in production and writes events for the configured tenant", async () => {
    const { tenantDb, tenants } = recordingTenantDb();
    const client = buildAuditClient({ production: true, tenantDb, defaultTenantId: TENANT_ID });
    await client.logEvent({ action: "auth.denied", actorType: "user", actorId: "anonymous", outcome: "DENIED", gate: 2 });
    expect(tenants).toEqual([TENANT_ID]);
  });
});
