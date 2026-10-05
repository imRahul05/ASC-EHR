# I01 — `@asc/authz` core: types, `can()`, grants, `IdentityPort`

| Field | Value |
|---|---|
| Track · Size | A · M |
| Depends on | I00 |
| Unblocks | I02, I04, I06, I07, I08 |
| Requirements | M12-2 |
| Branch | `phase/I01-authz-core` |

## Goal
A pure TypeScript package that answers "may this principal do this capability at this facility?" with no I/O, plus the shared types and Zod schemas every app will use. Lint forbids role-name checks anywhere else.

## Out of scope
Role templates (I02), policy compiler (I03), any app wiring (I05, I08), Medplum.

## File structure
```text
packages/types/src/authz.ts                  NEW   CAPABILITIES const tuple + metadata, Capability, RoleKey (string), Grant, Principal, PrincipalKind, TenantRef
packages/types/src/index.ts                  EDIT  export authz types
packages/validation/src/authz.ts             NEW   capabilitySchema, grantSchema, principalSchema, meResponseSchema
packages/validation/src/authz.test.ts        NEW
packages/validation/package.json             EDIT  "./authz" leaf subpath export
packages/authz/package.json                  NEW   @asc/authz (deps: @asc/types), sideEffects false, exports ".", "./testing"
packages/authz/tsconfig.json · eslint.config.mjs  NEW  copy of @asc/audit pattern
packages/authz/src/can.ts                    NEW   can(), canAny(), grantsAt()
packages/authz/src/authorize.ts              NEW   authorize() → { allowed, reason, gate }
packages/authz/src/identity-port.ts          NEW   IdentityPort interface
packages/authz/src/testing/fake-identity.ts  NEW   in-memory IdentityPort for tests/mocks (subpath "./testing")
packages/authz/src/index.ts                  NEW
packages/authz/src/*.test.ts                 NEW
packages/authz/README.md                     NEW
packages/eslint-config/rules/no-role-name-checks.js       NEW   bans `x.role === "…"`, `roleKey === "…"` outside @asc/authz
packages/eslint-config/rules/no-role-name-checks.test.js  NEW
packages/eslint-config/app.js · base.js      EDIT  enable rule
```

## Commit plan
| # | Commit | Workspace | ~Lines | Needs |
|---|---|---|---|---|
| C1 | `feat(types): add capability catalog const and Capability type` | `@asc/types` | 120 | — |
| C2 | `feat(types): add Grant, Principal and TenantRef types` | `@asc/types` | 60 | C1 |
| C3 | `feat(validation): add principal and grant schemas with tests` | `@asc/validation` | 140 | C2 |
| C4 | `chore(authz): scaffold @asc/authz package` | `@asc/authz` | 60 | — |
| C5 | `feat(authz): add can() with facility-scoped grants` | `@asc/authz` | 150 | C2, C4 |
| C6 | `test(authz): cross-facility leak cases (rn@A, supervisor@B)` | `@asc/authz` | 120 | C5 |
| C7 | `feat(authz): add authorize() result with gate and reason` | `@asc/authz` | 90 | C5 |
| C8 | `feat(authz): add IdentityPort and in-memory fake` | `@asc/authz` | 110 | C2 |
| C9 | `feat(eslint-config): ban role-name comparisons outside authz` | `@asc/eslint-config` | 150 | — |
| C10 | `docs(authz): package README with usage and rules` | `@asc/authz` | 80 | C8 |

**Lanes:** C1→C2→C3 and C4→C5→C6→C7 can run as two lanes after C2; C9 is independent.

## Key behaviour (tests must prove)
- `can(p, cap)` with no facility counts **only** `scope: all` grants (fail closed).
- `can(p, cap, {facilityId})` counts `scope: all` + grants for that facility.
- Unknown capability string → type error (closed union) and `false` at runtime if forced.
- Principal with `kind: "patient"` never gets staff capabilities even if a grant lists them (defence in depth).
- Empty grants → everything false.
- `authorize()` returns gate `3` for facility mismatch, `4` for missing capability.

## Checklist
- [ ] `@asc/authz` has zero runtime deps except `@asc/types`; no `process.env`, no fetch
- [ ] `RoleKey` is `string`, not a union (D-A2)
- [ ] Capability catalog is one `as const` tuple; metadata (`description`, `stepUp`, `phase`) per entry
- [ ] Table-driven tests for every `can()` rule above, including User X scenario
- [ ] Lint rule catches `user.role === "NURSE"`, `role !== "PATIENT"`, `switch(role)` with string cases; fixture tests pass
- [ ] Lint rule allow-list: `packages/authz/**` permanently; today's violators listed file-by-file as a temporary baseline (`apps/web/src/hooks/use-auth.ts`, `features/dashboard/role-dashboard.tsx`, `features/guide/use-tour.ts`, `features/guide/use-go-to.ts`, `features/guide/guide-personas.tsx`, `mocks/**`) — each entry removed by the I05 commit that fixes it; baseline must be empty at I05 end
- [ ] Leaf subpath `@asc/validation/authz` works from browser code (LM-005)
- [ ] `pnpm turbo run lint check-types test --filter=@asc/types --filter=@asc/validation --filter=@asc/authz --filter=@asc/eslint-config` green at every commit
- [ ] PROGRESS.md updated

## Acceptance
- `can()` is the only authorization primitive; README shows one example for API guard, one for UI.
- The existing app still builds (lint rule is introduced with today's violations allow-listed and listed in I05).
