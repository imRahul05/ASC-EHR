# I10 — Tenant provisioner

| Field | Value |
|---|---|
| Track · Size | B · M |
| Depends on | I03, I09, P02, P03 (`meta.accounts` builders) |
| Unblocks | I11, I12, I15, I16 |
| Requirements | 08 §4, §8; M22 |
| Branch | `phase/I10-provisioner` |

## Goal
One idempotent command creates or updates a tenant: Medplum Project, facility `Organization`s, compiled AccessPolicies, `ClientApplication`s, the first admin invite, and the app-DB registry row. Running it twice changes nothing. `--plan` shows the diff without applying.

## Out of scope
Role lifecycle commands (I16), SSO `DomainConfiguration` (deferred I21), Azure Key Vault wiring beyond the interface (P06).

## File structure
```text
apps/bots/scripts/provision/index.ts           NEW   CLI: provision-tenant --slug --name --facilities file --admin-email [--plan]
apps/bots/scripts/provision/project.ts         NEW   upsert Project (super-admin client, ops only)
apps/bots/scripts/provision/organizations.ts   NEW   upsert facility Organizations (identifier system per tenant)
apps/bots/scripts/provision/policies.ts        NEW   upsert compiled policies by name-version; never delete referenced ones
apps/bots/scripts/provision/clients.ts         NEW   web (PKCE) + worker (client credentials) per tenant; secret sink interface
apps/bots/scripts/provision/memberships.ts     NEW   assignRoles(user, [{roleKey, facilityIds}]) → access[] entries
apps/bots/scripts/provision/invite.ts          NEW   first tenant admin invite
apps/bots/scripts/provision/registry.ts        NEW   write tenants / tenant_hosts row via @asc/db
apps/bots/scripts/provision/plan.ts            NEW   diff current vs desired, print, exit code
apps/bots/scripts/provision/*.test.ts          NEW   MockClient-based
apps/bots/scripts/seed-local.ts                EDIT  call provisioner for the dev tenant + demo identities
docs/runbooks/provision-tenant.md              NEW
```

## Commit plan
| # | Commit | ~Lines |
|---|---|---|
| C1 | `feat(bots): provisioner CLI skeleton with plan mode` | 120 |
| C2 | `feat(bots): upsert tenant project` | 90 |
| C3 | `feat(bots): upsert facility organizations` | 100 |
| C4 | `feat(bots): upsert compiled access policies by version` | 130 |
| C5 | `feat(bots): create per-tenant web and worker clients` | 120 |
| C6 | `feat(bots): assign roles to memberships with facility params` | 140 |
| C7 | `feat(bots): invite first tenant admin` | 70 |
| C8 | `feat(bots): write tenant registry row in app db` | 80 |
| C9 | `test(bots): provisioning twice produces no changes` | 100 |
| C10 | `refactor(bots): seed-local uses the provisioner` | 80 |
| C11 | `docs(runbooks): provision a tenant` | 80 |

## Rules
- Super-admin credentials only from the ops environment; never in app runtime config (test: app `@asc/config` schema has no super-admin key).
- `assignRoles` rejects `retired` templates and conflicting combinations recorded in S1b.
- Secrets go through a `SecretSink` interface (local: `.env.local` file ignored by git; Azure: Key Vault in P06).
- Every applied change emits an audit event through `@asc/audit` (`tenant.provisioned`, `role.template.published`, `membership.created`, `role.assigned`, `user.invited`) — wired to the durable store when I14 lands.

## Checklist
- [ ] `--plan` prints the same diff the apply step executes (test)
- [ ] Second run = zero changes (test)
- [ ] Policies are never deleted while any membership references them
- [ ] Each facility `Organization` id is recorded for `%facility` parameters
- [ ] No secrets printed or committed; `phi-review` run
- [ ] Runbook covers create, add facility, re-run after template change
- [ ] Green at every commit; PROGRESS.md updated
