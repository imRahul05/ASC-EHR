# I06 — Tenancy foundation in app Postgres

| Field | Value |
|---|---|
| Track · Size | A · M |
| Depends on | I01 |
| Unblocks | I08, I12, I14, I17 |
| Requirements | M22 (model ready in P1), 08 §4.4 |
| Branch | `phase/I06-tenancy-foundation` |

## Goal
App-owned tables are tenant-isolated by Postgres row-level security, the only way to query is `withTenant(tenantId, tx => …)`, and a tenant registry resolves host → tenant. Isolation is proven by integration tests.

## Out of scope
Medplum Projects (I10), web middleware and API plugin (I08, I12), audit table (I14).

## File structure
```text
packages/db/src/schema/tenants.ts             NEW   tenants (id uuid, slug unique, status, medplum_project_id, mfa_mode, created_at), tenant_hosts (host unique, tenant_id)
packages/db/src/schema/agent-runs.ts          EDIT  tenant_id uuid NOT NULL, facility_id text NULL
packages/db/drizzle/0001_*.sql …              NEW   generated + hand-written RLS SQL
packages/db/src/tenant.ts                     NEW   withTenant(db, tenantId, fn) — sets app.tenant_id per transaction
packages/db/src/tenant-registry.ts            NEW   resolveTenantByHost(host) with TTL cache interface
packages/db/src/agent-run-store.ts            EDIT  takes a tenant-scoped tx
packages/db/src/index.ts                      EDIT  stop exporting raw query paths for tenant tables
packages/db/src/__tests__/tenant-isolation.test.ts  NEW
packages/config/src/env.ts                    EDIT  DATABASE_RUNTIME_URL (non-owner role), TENANT_APEX_DOMAIN
docker-compose.yml                            EDIT  init script creating owner + runtime roles
packages/db/README.md                         EDIT  tenancy rules
```

## Commit plan (expand → contract)
| # | Commit | ~Lines |
|---|---|---|
| C1 | `feat(db): add tenants and tenant_hosts tables` | 90 + SQL |
| C2 | `feat(db): add nullable tenant_id and facility_id to agent_runs` | 40 + SQL |
| C3 | `feat(db): backfill dev tenant and make tenant_id not null` | 30 + SQL |
| C4 | `feat(db): enable and force RLS on agent_runs` | SQL 40 |
| C5 | `chore(db): separate owner and runtime database roles` | 60 |
| C6 | `feat(db): add withTenant transaction wrapper` | 80 |
| C7 | `refactor(db): agent run store runs inside withTenant` | 120 |
| C8 | `test(db): tenant isolation and missing-context cases` | 150 |
| C9 | `feat(db): add tenant registry host resolution with cache` | 110 |
| C10 | `feat(config): add runtime database url and tenant apex domain` | 40 |
| C11 | `docs(db): document tenancy rules and withTenant` | 60 |

## RLS shape
```sql
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_runs
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```
`current_setting(..., true)` returns NULL when unset → no rows (fail closed).

## Tests must prove (need `TEST_DATABASE_URL`, same pattern as `agent-run-store.test.ts`)
- Tenant A context cannot read, update or insert tenant B rows.
- No `app.tenant_id` set → zero rows, insert rejected.
- Runtime role cannot `ALTER TABLE`, `DISABLE ROW LEVEL SECURITY`, or bypass via `SET ROLE`.
- `withTenant` resets context after the transaction (pooled connection reuse test).
- Unknown host → `null` from registry; inactive tenant → `null`.

## Checklist
- [ ] `org_id` decision (Q-IAM-A) applied and noted in `@asc/agents` follow-up if renamed
- [ ] Migrations run as owner; app uses runtime role (env split in `@asc/config`, LM-006)
- [ ] Every new app table template in README includes `tenant_id NOT NULL` + RLS
- [ ] Integration tests skip cleanly without `TEST_DATABASE_URL`, and are run locally with it before PR
- [ ] Hand-written SQL reviewed with `phi-review`
- [ ] Green at every commit; PROGRESS.md updated
