# @asc/db

App-owned operational data in Postgres via Drizzle ORM (postgres.js driver). Decision: [ADR 2026-09-26](../../docs/decisions/2026-09-26-adopt-postgres-with-drizzle-for-application-data.md).

The clinical record is **not** here — it lives in Medplum (FHIR). This package holds platform state such as agent execution records.

## Contents

| Path | What |
|---|---|
| `src/client.ts` | `createDb({ url, max? })` → `{ db, close }`. The URL comes from the app (`parseEnv()` in `@asc/config`); this package never reads `process.env`. |
| `src/schema/` | Drizzle table definitions (`agent_runs`). |
| `drizzle/` | Generated SQL migrations — commit them, never edit applied ones. |
| `src/agent-run-store.ts` | `createPostgresAgentRunStore(db)` — implements `AgentRunStore` from `@asc/agents`. |

## Commands (from repo root)

```bash
pnpm db:up          # local Postgres (docker compose), waits until healthy
pnpm db:generate    # after changing src/schema → new SQL migration in drizzle/
pnpm db:migrate     # apply migrations (DATABASE_URL, defaults to the local compose DB)
pnpm db:down

TEST_DATABASE_URL=postgres://asc:asc@localhost:5432/asc_ehr pnpm --filter @asc/db test
```

Integration tests migrate into a throwaway schema per run and are skipped when `TEST_DATABASE_URL` is unset.

## `agent_runs` and the run store

- One row per `executionId` (pass a job-derived id to `runAgent`).
- `begin` is a single atomic `INSERT … ON CONFLICT (execution_id) DO UPDATE … WHERE … RETURNING`: it claims a new run, a `failed` run, or a stale `running` run — **only for the same agent, org, patient and case** (`IS NOT DISTINCT FROM`), mirroring `isSameRunOwner` in `@asc/agents`. Otherwise the existing row is returned unclaimed (replay / in progress / conflict).
- `claim` is a fencing token; `succeed` / `fail` apply only to `status = 'running' AND claim = $claim`.
- All timestamps use the database clock (`now()`).

## ⚠️ PHI

`agent_runs.output` stores model output → **PHI**. Staging/production must use encrypted-at-rest Postgres (Azure Postgres Flexible Server), TLS, a least-privilege role, and a retention policy. Never copy rows into Redis, logs, telemetry or audit details. Never load real PHI into the local compose database.
