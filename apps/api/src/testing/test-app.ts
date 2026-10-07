/**
 * Test support: builds the app with fakes. Never imported by production code
 * (the server entry points do not reach it).
 */

import type { AuditEventInput } from "@asc/audit";
import { StaticTenantResolver } from "@asc/authz";
import { TEST_TENANT } from "@asc/authz/testing";

import { buildApp } from "../app.js";

export function memoryAudit() {
  const events: AuditEventInput[] = [];
  return {
    events,
    logEvent: (event: AuditEventInput): Promise<void> => {
      events.push(event);
      return Promise.resolve();
    },
  };
}

export async function buildTestApp(overrides: Partial<Parameters<typeof buildApp>[0]> = {}) {
  const audit = memoryAudit();
  const app = await buildApp({
    corsOrigins: [],
    rateLimit: { ipMax: 10_000, windowMs: 60_000 },
    tenantResolver: new StaticTenantResolver(TEST_TENANT),
    audit,
    catalogVersion: "test-sha",
    ...overrides,
  });
  return { app, audit, tenant: TEST_TENANT };
}
