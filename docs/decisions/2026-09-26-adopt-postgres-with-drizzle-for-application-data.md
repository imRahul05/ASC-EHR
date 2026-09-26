---
status: accepted
date: 2026-09-26
decision-makers: 
---

# Adopt Postgres with Drizzle for application data

## Context and Problem Statement

The clinical record lives in Medplum (see [Adopt Medplum as the clinical data platform](2026-09-25-adopt-medplum-as-clinical-data-platform.md)). The apps also own **operational data** that is not a FHIR resource and should not be modelled as one:

1. **Agent execution state** (now): `runAgent` needs one record per run, keyed by a stable `executionId`, so a retried BullMQ job neither calls a model twice nor produces a second draft. The `AgentRunStore` contract (`packages/agents/src/state/run-store.ts`) requires an atomic claim (`INSERT … ON CONFLICT DO UPDATE … WHERE … RETURNING`), a fencing token (`claim`) and stale-run takeover. A succeeded record holds the model output, which is **PHI**.
2. **Later**: conversation state for interactive agents, app/tenant configuration and similar app-owned tables.

Redis (BullMQ) is not durable enough and must never hold PHI; Medplum's database is Medplum's, not ours to add tables to. We need a relational store the apps own, with SQL migrations and a typed client usable from `apps/api` and `apps/worker`, and a local setup that matches production closely.

## Decision

- **Database**: PostgreSQL for app-owned operational data — Azure Database for PostgreSQL Flexible Server in staging/production, a separate database from Medplum's. The clinical record stays in Medplum.
- **Shared package**: `@asc/db` (`packages/db`, JIT source package like every `@asc/*` library) owns the schema, the client factory and store implementations (first: `createPostgresAgentRunStore`, implementing `AgentRunStore` with the same semantics as the in-memory reference).
- **ORM / driver**: **Drizzle ORM** with the **`postgres` (postgres.js)** driver. Schema is TypeScript (`packages/db/src/schema/`), no codegen and no build step.
- **Migrations**: **drizzle-kit** generates plain SQL migrations into `packages/db/drizzle/` (reviewed and committed); `pnpm db:generate` / `pnpm db:migrate` at the root delegate to the package.
- **Configuration**: apps parse `DATABASE_URL` with `parseEnv()` (`@asc/config`) and pass it to `createDb({ url })`; the package never reads `process.env`. The only exception is `packages/db/drizzle.config.ts` (tooling loaded by drizzle-kit itself).
- **Local development**: root `docker-compose.yml` runs `postgres:17` on `localhost:5432` (db `asc_ehr`, dev-only credentials `asc`/`asc`); `pnpm db:up` / `pnpm db:down`.

### Options considered

- **Prisma** — mature, but needs a generated client (a codegen/build step, at odds with our JIT packages and tsup bundling) and its query API cannot express the atomic conditional upsert (`ON CONFLICT … DO UPDATE … WHERE … RETURNING`) without dropping to raw SQL, losing typing exactly where correctness matters most.
- **Kysely** — excellent typed SQL builder, but no schema-as-code or migration generation; we would hand-write migrations and keep types in sync manually.
- **Raw `pg` / postgres.js** — full control, but no typed schema, hand-written row mapping and migrations everywhere.
- **Drizzle (chosen)** — schema in TypeScript, inferred row types, SQL-first builder that expresses `onConflictDoUpdate` with `setWhere` and `excluded.*`, a `sql` escape hatch, and drizzle-kit SQL migrations. Lightweight runtime, no codegen.

**Non-goals**: storing clinical data (FHIR resources) outside Medplum; using Postgres as a queue (BullMQ stays).

## Consequences

- Good, because agent retries become idempotent on a durable store with database-enforced atomicity (one statement claims a run; concurrent callers serialize on the row lock).
- Good, because the schema is typed end-to-end and migrations are reviewable SQL files.
- Good, because local, staging and production run the same engine (Postgres 17).
- Bad, because we now run a second database next to Medplum's (backups, upgrades, monitoring, access reviews).
- Bad, because Drizzle is pre-1.0 and its APIs still move; upgrades need care.
- Neutral: **reversible while only one table (`agent_runs`) exists** — switching ORM or store now costs one schema file, one store and one migration.

### PHI and compliance

- `agent_runs.output` is **PHI** (validated model output kept for replay). The database therefore needs the same controls as any PHI store: encryption at rest (Azure Postgres Flexible Server, BAA-covered subscription), **TLS in transit** (`sslmode=require` in every deployed `DATABASE_URL`), a **least-privilege application role** (DML on its tables only; migrations run under a separate role), private networking, backups under the same controls.
- Run records and outputs are **never** copied to Redis, job payloads/return values, logs, telemetry or audit details. Column names and comments carry no PHI; only `output` holds it (`context_manifest` is metadata, `failure_kind` / `error_name` are PHI-free).
- **Retention policy: TBD** — decide how long succeeded outputs are kept (e.g. purge `output` once the draft is accepted into Medplum or after N days) before the first production workload.
- Local docker Postgres uses dev-only credentials and must never hold real PHI.

## Implementation Plan

- **Affected paths**:
  - `packages/db/` — `src/client.ts` (`createDb`, `runMigrations`), `src/schema/agent-runs.ts`, `src/agent-run-store.ts`, `drizzle/` (SQL migrations), `drizzle.config.ts`.
  - `docker-compose.yml`, root `package.json` (`db:up`, `db:down`, `db:migrate`, `db:generate`).
  - `packages/config/src/env.ts` — optional `DATABASE_URL` in the api and worker schemas.
- **Dependencies**: `drizzle-orm`, `postgres`; dev `drizzle-kit` (all in `@asc/db` only).
- **Patterns to follow**:
  - Every app-owned table lives in `packages/db/src/schema/`; change it, run `pnpm db:generate`, commit the SQL.
  - Apps create one pool per process with `createDb({ url: env.DATABASE_URL })` and call `close()` on shutdown.
  - Use database time (`now()`) for anything compared across processes (claims, staleness).
- **Patterns to avoid**:
  - Do not read `process.env` in `@asc/db`; do not import `@asc/db` from browser code.
  - Do not add tables for clinical data here — that is Medplum's job.
  - Do not log rows, SQL parameters or query results from PHI tables.

### Verification

- [x] `docker compose up -d postgres` is healthy; `pnpm db:migrate` applies `0000_init_agent_runs.sql`.
- [x] `createPostgresAgentRunStore` passes the `AgentRunStore` contract cases plus owner-scope and concurrency tests (`TEST_DATABASE_URL=… pnpm --filter @asc/db test`).
- [ ] `DATABASE_URL` becomes required in the worker once the first agent job persists runs.
- [ ] Azure Postgres Flexible Server provisioned per environment (encryption, TLS, least-privilege role, private access).
- [ ] Retention policy for `agent_runs.output` decided and implemented.

## More Information

- Contract: `packages/agents/src/state/run-store.ts`; reference implementation: `packages/agents/src/testing/run-store.ts`.
- Drizzle ORM: https://orm.drizzle.team
- postgres.js: https://github.com/porsager/postgres
