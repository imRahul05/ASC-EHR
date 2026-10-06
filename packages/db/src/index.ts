/**
 * @asc/db — app-owned operational data in Postgres (Drizzle + postgres.js).
 * The clinical record lives in Medplum, not here.
 * ADR: docs/decisions/2026-09-26-adopt-postgres-with-drizzle-for-application-data.md
 *
 * Server-only: never import from apps/web client code.
 * Tenant-scoped access only (`createTenantDb().withTenant`). Migrations live in `@asc/db/migrate`.
 */

export { createTenantDb, type CreateTenantDbOptions, type TenantDb, type TenantTx } from './tenant.js';
export * from './schema/index.js';
export { createPostgresAgentRunStore, type AgentRunScope } from './agent-run-store.js';
export { createPostgresAuditStore, AuditTenantMissingError, type PostgresAuditStoreOptions } from './audit-store.js';
export { DatabaseError } from './db-error.js';
