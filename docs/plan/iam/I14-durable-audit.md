# I14 — Durable, append-only audit store and IAM event emission

| Field | Value |
|---|---|
| Track · Size | B · M |
| Depends on | I07, I11 (and I06 for RLS) |
| Unblocks | I16, I17, P26 audit report |
| Requirements | M12-4, D-A8 |
| Branch | `phase/I14-durable-audit` |

## Goal
IAM and business audit events are stored durably in an append-only, tenant-isolated Postgres table; the runtime role can insert and read but never update or delete. Login, logout, denials, step-up and provisioning changes all produce events. Medplum `AuditEvent` keeps covering FHIR access.

## Out of scope
Audit report export and break-glass alerts (P26 / I22), SIEM forwarding.

## File structure
```text
packages/db/src/schema/audit-events.ts          NEW   tenant_id NOT NULL, facility_id, actor_kind, actor_id, membership_id, action, outcome, gate, resource_type, resource_id, request_id, session_id, client_ip_hash, details jsonb, occurred_at
packages/db/drizzle/00xx_audit_events.sql       NEW   table + RLS + REVOKE UPDATE, DELETE, TRUNCATE + trigger raising on UPDATE/DELETE
packages/db/src/audit-store.ts                  NEW   PostgresAuditStore implements AuditStore { durable: true, appendOnly: true }
packages/db/src/__tests__/audit-store.test.ts   NEW
apps/api/src/composition.ts                     EDIT  configureAuditStore(PostgresAuditStore)
apps/api/src/plugins/authn.ts · guards/*        EDIT  emit events (some already emitting via I08 helper)
apps/api/src/routes/audit.ts                    NEW   GET /audit (capability audit.read, tenant-scoped, paginated, filters)
apps/bots/scripts/provision/*                   EDIT  provisioner events go to the same store
```

## Commit plan
| # | Commit | Workspace | ~Lines |
|---|---|---|---|
| C1 | `feat(db): add audit_events table with tenant RLS` | `@asc/db` | 90 + SQL |
| C2 | `feat(db): block update and delete on audit_events` | `@asc/db` | SQL 40 |
| C3 | `feat(db): Postgres audit store` | `@asc/db` | 100 |
| C4 | `test(db): audit store append-only and tenant isolation` | `@asc/db` | 130 |
| C5 | `feat(api): configure durable audit store at startup` | `apps/api` | 40 |
| C6 | `feat(api): emit auth login, logout and denied events` | `apps/api` | 90 |
| C7 | `feat(api): add tenant-scoped audit read endpoint` | `apps/api` | 140 |
| C8 | `feat(bots): provisioner writes events to durable store` | `apps/bots` | 60 |
| C9 | `docs(audit): audit sources, retention and query guide` | docs | 60 |

## Checklist
- [ ] `UPDATE`/`DELETE`/`TRUNCATE` as runtime role fail (test); trigger also blocks owner-role mistakes
- [ ] Every event row has `tenant_id`, `action`, `outcome`, `occurred_at`, actor id; `gate` on denials
- [ ] `GET /audit` requires `audit.read` and returns only the caller's tenant (and facility scope if facility-scoped)
- [ ] Store failure surfaces (no silent drop), matching `AuditClient` contract
- [ ] Retention period recorded (default: 6 years, confirm with compliance)
- [ ] `phi-review` run; green at every commit; PROGRESS.md updated

## Open questions
| ID | Question | Default |
|---|---|---|
| Q-IAM-C | Hash chain for tamper evidence | Deferred; insert-only + trigger now |
| Q-I14-1 | Retention period | 6 years (HIPAA documentation retention); confirm |
