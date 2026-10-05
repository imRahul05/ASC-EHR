# I05 — UI on the mock: Principal, `useCan`, capability nav, remove `UserRole`

| Field | Value |
|---|---|
| Track · Size | A · M (two PRs: **I05a**, **I05b**) |
| Depends on | I02, I04 |
| Unblocks | I12 |
| Requirements | M12-2, 07 §2 |
| Branches | `phase/I05a-principal-and-guards`, `phase/I05b-workspaces-remove-userrole` |

## Goal
The mock web app runs entirely on a `Principal` from `GET /me` (MSW). Nav, route guards, dashboards and labels come from capabilities, workspaces and role templates. `UserRole` and every `Record<UserRole,…>` map are gone. Adding a demo `tech` user needs only data/config.

## Out of scope
Real login (I12), API guards (I08), deleting the demo persona switcher (it stays for the hosted demo, now switching **identities**).

## Today's role-coupled code (baseline to remove)
| File | Coupling |
|---|---|
| `packages/types/src/auth.ts`, `packages/validation/src/auth.ts` | `UserRole` union + Zod enum (duplicated) |
| `apps/web/src/hooks/use-auth.ts` | `role === "PATIENT"` redirect; `switchRole(role)` |
| `apps/web/src/components/shell/nav-config.ts` | `NAV_BY_ROLE`, `ROLE_LABEL` |
| `apps/web/src/features/dashboard/dashboard-config.tsx`, `role-dashboard.tsx` | `DASHBOARD_BY_ROLE`, `role === "PATIENT"` |
| `apps/web/src/features/guide/*` | `ROLE_BADGE`, `PERSONA_GUIDE`, `role` per step |
| `apps/web/src/features/worklist/worklist-view.tsx` | `DEFAULT_TAB`, `ROLE_LABEL` |
| `apps/web/src/features/admin/admin-columns.tsx` | `ROLE_LABEL` |
| `apps/web/src/components/auth/demo-login-bar.tsx`, `signup-*.ts(x)` | `PERSONAS`, `SIGNUP_SAMPLES`, role picker |
| `packages/validation/src/auth.ts` | `SIGNUP_ROLE_FIELDS` keyed by role |
| `apps/web/src/mocks/**` | `actorFrom` falls back to ADMIN; login accepts any email |
| `packages/types/src/clinical.ts` | `StaffRole`, `TimeOutRole`, `WorkItem.ownerRole`, `AuditActor.role` (clinical participation mixed with authz role) |

## File structure (new pieces)
```text
packages/config/src/api.ts                       EDIT  authMe route
packages/api-client/src/auth.ts                  EDIT  getMe()
packages/api-client/src/react/query-keys.ts      EDIT  auth.me
apps/web/src/mocks/data/identities.ts            NEW   demo identities: profile + assignments [{roleKey, facilityId}]
apps/web/src/mocks/handlers/auth.ts              EDIT  /me → Principal via @asc/authz buildGrants
apps/web/src/lib/stores/auth.store.ts            EDIT  { principal, profile, facilityId, workspaceKey }
apps/web/src/hooks/use-can.ts                    NEW   useCan(cap) → can(principal, cap, {facilityId})
apps/web/src/components/auth/can.tsx             NEW   <Can cap>…</Can> (convenience only)
apps/web/src/components/auth/require-capability.tsx NEW route guard → 403 screen
apps/web/src/features/workspaces/workspaces.ts   NEW   WorkspaceDef[] + dashboard/nav profile per workspace
apps/web/src/components/shell/workspace-switcher.tsx NEW  shown only when >1 workspace or facility
```

## Commit plan — I05a (Principal, guards, nav)
| # | Commit | Workspace | ~Lines |
|---|---|---|---|
| C1 | `feat(config): add auth me route` | `@asc/config` | 10 |
| C2 | `feat(api-client): add getMe and auth.me query key` | `@asc/api-client` | 50 |
| C3a | `feat(authz): add clinical-supervisor template (extensibility proof)` | `@asc/authz` | 50 |
| C3b | `feat(web): add demo identities with role assignments` | `apps/web` | 140 |
| C4 | `feat(web): mock /me returns Principal built by @asc/authz` | `apps/web` | 90 |
| C5 | `fix(web): mock auth fails closed on unknown user or token` | `apps/web` | 60 |
| C6 | `feat(web): keep Principal and current facility in session` | `apps/web` | 100 |
| C7 | `feat(web): add useCan hook and Can component` | `apps/web` | 80 |
| C8 | `feat(web): add RequireCapability route guard` | `apps/web` | 80 |
| C9 | `feat(web): guard admin, audit, coding and quality routes` | `apps/web` | 60 |
| C10 | `refactor(web): nav items declare required capability` | `apps/web` | 150 |

C6 is **expand**: keep `user` (profile) next to `principal` so untouched screens still work. C10 deletes `NAV_BY_ROLE` and removes `nav-config.ts` from the lint baseline.

## Commit plan — I05b (workspaces, labels, remove `UserRole`)
| # | Commit | Workspace | ~Lines |
|---|---|---|---|
| C11 | `feat(web): add workspace definitions and home routing` | `apps/web` | 120 |
| C12 | `refactor(web): dashboard config keyed by workspace` | `apps/web` | 140 |
| C13 | `feat(web): add workspace and facility switcher` | `apps/web` | 110 |
| C14 | `refactor(web): role labels come from role templates` | `apps/web` | 120 |
| C15 | `refactor(web): guide and tour switch demo identity, not role` | `apps/web` | 150 |
| C16 | `refactor(types): separate clinical participant roles from authz` | `@asc/types` + minimal `apps/web` fix | 150 |
| C17 | `refactor(web): replace self-signup role picker with access request` | `apps/web` | 150 |
| C18 | `refactor(validation): remove role-keyed signup schema` | `@asc/validation` | 80 |
| C19 | `refactor(types): remove UserRole and userRoleSchema` | `@asc/types`, `@asc/validation` | 60 |
| C20 | `chore(eslint-config): empty the role-check baseline` | `@asc/eslint-config` | 20 |
| C21 | `test(web): add tech identity with config only (extensibility proof)` | `apps/web` | 80 |
| C22 | `docs(web): update mock-frontend and UI guidelines for capabilities` | docs | 80 |

**C16 detail:** `TimeOutRole` → `TimeOutParticipant` (`proceduralist | rn | anesthesia`), `WorkItem.ownerRole` → `WorkItem.queue` (queue key; queues list a capability), `StaffMember.role` → `StaffMember.qualifications[]`. These are clinical facts, not permissions; who may attest is `can(…, "timeout.participate")`.

**C21 proof:** the commit may touch only `mocks/data/identities.ts`, `features/workspaces/workspaces.ts` (if a workspace is added) and a test. Any other file in the diff fails the acceptance.

## Checklist
- [ ] Every commit green: `pnpm turbo run lint check-types test --filter=web --filter=<pkg>`; each web commit loaded in `pnpm dev` (LM-005)
- [ ] Mock: unknown email → 401; bad token → 401 (no ADMIN fallback)
- [ ] Direct URL to a guarded route without the capability shows 403 screen (test per guarded route)
- [ ] C3a diff is only the template file, one registry line and the matrix snapshot (proves "new role = data")
- [ ] User X demo identity: `rn` at North, `rn` + `clinical-supervisor` at South; switching facility changes nav and workspaces (test)
- [ ] `grep -rn "UserRole\|NAV_BY_ROLE\|DASHBOARD_BY_ROLE\|SIGNUP_ROLE_FIELDS" apps packages` returns nothing at I05b end
- [ ] No `role ===` / `role !==` literal comparisons anywhere (lint baseline empty)
- [ ] No token or profile in browser storage (LM-004 still holds)
- [ ] Bundle budgets still pass (`pnpm --filter web build && pnpm --filter web test:bundles`)
- [ ] Docs 07 §2 and ui-guidelines updated
- [ ] PROGRESS.md updated after each PR

## Open questions
| ID | Question | Default |
|---|---|---|
| Q-I05-1 | Keep public `/signup` at all? | Replace with "request access" (invite-only per 08 §5.3) |
| Q-I05-2 | Demo persona bar wording | "Switch demo user" listing identities, not roles |
