/**
 * @asc/db — app-owned operational data in Postgres (Drizzle + postgres.js).
 * The clinical record lives in Medplum, not here.
 * ADR: docs/decisions/2026-09-26-adopt-postgres-with-drizzle-for-application-data.md
 *
 * Server-only: never import from apps/web client code.
 */

export { createDb, MIGRATIONS_FOLDER, runMigrations, type CreateDbOptions, type Db } from './client.js';
export * from './schema/index.js';
export { createPostgresAgentRunStore } from './agent-run-store.js';
