# I16 — Role lifecycle operations

| Field | Value |
|---|---|
| Track · Size | B · M |
| Depends on | I10, I14 (I15 recommended) |
| Unblocks | I17 |
| Requirements | D-A5; review scenarios A–G |
| Branch | `phase/I16-role-lifecycle` |

## Goal
Every change to roles and user access is a scripted, dry-runnable, audited operation, so the scenarios "rename Nurse to RN", "split Front Desk", "add Nurse Supervisor", "give a physician admin", "remove a role at a facility", "change a role's permissions" and "disable a user" are data operations plus (at most) a template file.

## Out of scope
A tenant-admin UI (deferred I24; Medplum App is the P1 admin console). Tenant-specific custom roles (deferred).

## Operations (all support `--plan`, all emit audit events)
| Command | What it does | Code or data? |
|---|---|---|
| `role publish <key>` | Compile and upsert `<key>-v<n>` into every tenant | Template file (code PR) + run |
| `role repoint <key> --to v<n> [--tenant]` | Move memberships to the new version; old kept until unreferenced | Data |
| `role rename-label <key> "<label>"` | Label only; key unchanged | Template edit (one line) |
| `role deprecate <key> [--replaced-by x]` | Blocks new assignments | Template status |
| `role retire <key>` | Refuses while any membership references it | Template status |
| `role split <from> --into a,b --map file.csv` | Assign new roles per mapping, then remove `<from>` | Data (+ new templates) |
| `role merge <a,b> --into c` | Inverse of split | Data |
| `member assign/remove <user> <roleKey> [--facility]` | Edit `access[]` entries | Data |
| `member disable/enable <user>` | Membership `active` flag; cache ≤ 60 s | Data |
| `member facilities <user> --add/--remove` | Facility params | Data |

## File structure
```text
apps/bots/scripts/iam/cli.ts               NEW   command router (shares provisioner modules)
apps/bots/scripts/iam/<command>.ts         NEW   one file per command
apps/bots/scripts/iam/*.test.ts            NEW   MockClient
packages/authz/src/roles/lifecycle.ts      NEW   pure checks: canAssign, canRetire, splitPlan
docs/runbooks/role-and-access-changes.md   NEW   scenarios A–G step by step
```

## Commit plan
| # | Commit | Workspace | ~Lines |
|---|---|---|---|
| C1 | `feat(authz): lifecycle rules for assign, deprecate, retire` | `@asc/authz` | 100 |
| C2 | `feat(bots): iam cli skeleton sharing provisioner modules` | `apps/bots` | 80 |
| C3 | `feat(bots): role publish and repoint commands` | `apps/bots` | 140 |
| C4 | `feat(bots): role deprecate and retire with in-use check` | `apps/bots` | 110 |
| C5 | `feat(bots): member assign, remove and facilities commands` | `apps/bots` | 140 |
| C6 | `feat(bots): member disable and enable commands` | `apps/bots` | 70 |
| C7 | `feat(bots): role split and merge with mapping file` | `apps/bots` | 150 |
| C8 | `test(bots): scenarios A to G end to end on MockClient` | `apps/bots` | 150 |
| C9 | `docs(runbooks): role and access change procedures` | docs | 120 |

## Checklist
- [ ] Every command has `--plan`, is idempotent and emits the I00 C7 event
- [ ] `retire` refuses while referenced (test); `deprecate` blocks new assignment (test)
- [ ] Split leaves no user without access and no user with both old and new roles after completion (test)
- [ ] Disabled user loses API access within the cache TTL (integration against local Medplum, documented)
- [ ] Clinical work queues own by capability/queue, not role key (check P12 types from I05 C16)
- [ ] Runbook walks scenarios A–G with exact commands
- [ ] Green at every commit; `phi-review` run; PROGRESS.md updated
