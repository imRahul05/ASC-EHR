# @asc/db

App-owned operational data in Postgres via Drizzle ORM (postgres.js driver). Decision: [ADR 2026-09-26](../../docs/decisions/2026-09-26-adopt-postgres-with-drizzle-for-application-data.md).

The clinical record is **not** here — it lives in Medplum (FHIR). This package holds platform state such as agent execution records.

## Contents

| Path | What |
|---|---|
| `src/tenant.ts` | `createTenantDb({ url, max? })` → `{ withTenant(tenantId, tx => …), close }`. The **only** client the package root exports. `url` is `DATABASE_RUNTIME_URL` (parsed by the app with `parseEnv()`); this package never reads `process.env`. |
| `src/migrate.ts` | `@asc/db/migrate`: owner-side `createMigrationDb`, `runMigrations`, `MIGRATIONS_FOLDER`. Migrations and tooling only; not re-exported from the root. |
| `src/schema/` | Drizzle table definitions (`agent_runs`). |
| `drizzle/` | Generated SQL migrations — commit them, never edit applied ones. |
| `src/agent-run-store.ts` | `createPostgresAgentRunStore(tenantDb, { tenantId, facilityId? })` — implements `AgentRunStore` from `@asc/agents`. |

## Commands (from repo root)

```bash
pnpm db:up          # local Postgres (docker compose), waits until healthy
pnpm db:generate    # after changing src/schema → new SQL migration in drizzle/
pnpm db:migrate     # apply migrations (DATABASE_URL, defaults to the local compose DB)
pnpm db:down

TEST_DATABASE_URL=postgres://asc:asc@localhost:5432/asc_ehr pnpm --filter @asc/db test
```

Integration tests migrate into a throwaway schema per run and are skipped when `TEST_DATABASE_URL` is unset (without it, `pnpm --filter @asc/db test` reports the DB suites as skipped). Tests that prove isolation connect as the runtime login `asc_app` (derived from `TEST_DATABASE_URL`; override with `TEST_RUNTIME_DATABASE_URL`). The owner in `TEST_DATABASE_URL` may be a superuser, which bypasses RLS: that is why behaviour is tested as `asc_app`.

## Tenancy (P05e)

Single hospital, tenant-ready ([08 §4.4](../../docs/product/08-identity-access-and-tenancy.md)):

- `agent_runs.tenant_id uuid NOT NULL` and `facility_id text` (null = tenant-wide) are the source of truth (Q-IAM-A). `org_id` stays until `@asc/agents` migrates.
- Row-level security is **enabled and forced**. Policy `tenant_isolation` compares `tenant_id` with `app.tenant_id`. If that setting is unset or empty, reads return no rows and inserts/updates are rejected (fail closed).
- `withTenant` opens a transaction and sets `app.tenant_id` with `set_config(…, true)` (transaction-local, so it never leaks across pooled connections). The tenant id comes from the principal or job context, never from a request body or query string; a non-UUID is rejected before it touches the database.
- Two roles: the **owner** runs migrations (`DATABASE_URL`); the app connects as a member of `asc_runtime` (`DATABASE_RUNTIME_URL`; `asc_app` locally). `asc_runtime` is `NOLOGIN NOSUPERUSER NOBYPASSRLS`, owns nothing and has `SELECT, INSERT, UPDATE` on `agent_runs` only: no `DELETE`, `TRUNCATE`, `ALTER`, or `CREATE`. Each new table's migration grants explicitly.
- Local login: `docker/postgres/init/01-runtime-role.sql` (new volumes run it automatically; for an old volume see [Environments](../../docs/ENVIRONMENTS_AND_DEPLOYMENT.md#local-postgres-development)).
- Backfill: migration `0002` gives rows written before tenancy the configured tenant, read from the session setting `app.default_tenant_id`, and stops if any row would stay without one. Pass it as a URL parameter: `DATABASE_URL='postgres://…/asc_ehr?app.default_tenant_id=<DEFAULT_TENANT_ID>' pnpm db:migrate`, or `createMigrationDb({ url, defaultTenantId })`. An empty table needs nothing.
- `execution_id` is still a global primary key: another tenant reusing an id gets an error, never data. Revisit with a composite key if ids can collide across tenants.

## `agent_runs` and the run store

- One row per `executionId` (pass a job-derived id to `runAgent`).
- `begin` is a single atomic `INSERT … ON CONFLICT (execution_id) DO UPDATE … WHERE … RETURNING`: it claims a new run, a `failed` run, or a stale `running` run — **only for the same agent, org, patient and case** (`IS NOT DISTINCT FROM`), mirroring `isSameRunOwner` in `@asc/agents`. Otherwise the existing row is returned unclaimed (replay / in progress / conflict).
- `claim` is a fencing token; `succeed` / `fail` apply only to `status = 'running' AND claim = $claim`.
- All timestamps use the database clock (`now()`).

## ⚠️ PHI

`agent_runs.output` stores model output → **PHI**. Staging/production must use encrypted-at-rest Postgres (Azure Postgres Flexible Server), TLS, a least-privilege role, and a retention policy. Never copy rows into Redis, logs, telemetry or audit details. Never load real PHI into the local compose database.
