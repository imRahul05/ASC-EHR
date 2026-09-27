# P05 — Auth + roles as AccessPolicies (replace mock login)

| Field | Value |
|---|---|
| Wave · Lane · Size | 1 · Platform · M |
| Depends on | P04 |
| Unblocks | P12, P14 and every clinical slice |
| Source mix | MP |
| Requirements | M12-1…M12-5 (identity, MFA, roles, audit) |
| Branch | `phase/P05-auth-roles` |

## Goal
Real sign-in via Medplum OAuth2 (PKCE) with MFA; six roles enforced by AccessPolicies at the data layer; API rejects calls without a valid Medplum token; login/logout audited.

## Out of scope
Entra SSO (fast-follow, needs tenant — Q1), break-glass (P26).

## File structure
```text
infra/medplum/access-policies/{front-desk,rn,gi-physician,anesthesia,coder,admin}.json  NEW
apps/bots/scripts/seed-local.ts                     EDIT  upload policies, bind demo practitioners
packages/types/src/auth.ts                          EDIT  Role union matches policy names
packages/validation/src/auth.ts                     NEW   session/me response schema
packages/api-client/src/auth.ts                     EDIT  sign-in/out helpers over Medplum
apps/web/src/app/(auth)/login/page.tsx              EDIT  Medplum PKCE start
apps/web/src/app/(auth)/signin/callback/page.tsx    NEW
apps/web/src/lib/stores/auth.store.ts               EDIT  reads profile from Medplum; delete mock handlers for auth
apps/web/middleware.ts                              NEW   redirect unauthenticated to /login (no PHI in URL)
apps/api/src/plugins/auth.ts                        NEW   verify bearer (Medplum /auth/me, short cache) → request.user {id, roles}
apps/api/src/plugins/security.ts                    NEW   helmet, cors, rate-limit
packages/audit/…                                    EDIT  login/logout/denied events
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Role types + auth schemas | `@asc/types`, `@asc/validation` | contracts |
| T2 | AccessPolicy JSON per role (field-level hiding e.g. front desk ↛ Composition) + seed upload | `infra/medplum`, `apps/bots` | policies |
| T3 | API auth + security plugins | `apps/api` | 401/403 tests |
| T4 | Web PKCE login, callback, middleware; remove mock auth | `apps/web` (+ `@asc/api-client`) | real login |
| T5 | Audit events for auth | `@asc/audit` | events + tests |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | T3, T4 | T2 |
| T2 | — | T4 (demo users) | T1, T3 |
| T3 | T1 | P12, P14 | T2, T4, T5 |
| T4 | T1, T2 | P14 | T3, T5 |
| T5 | — | — | T2–T4 |

## Packages to add
| Package | Version | Workspace |
|---|---|---|
| `@fastify/helmet` | 13.1.1 | `apps/api` |
| `@fastify/cors` | 11.3.0 | `apps/api` |
| `@fastify/rate-limit` | 11.2.0 | `apps/api` |

## Acceptance
- [ ] Front-desk user cannot read `Composition` via Medplum directly (policy test)
- [ ] MFA required for all clinical roles
- [ ] API returns 401 without token, 403 on role mismatch
- [ ] No mock auth code left in `apps/web`
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q1 | Entra tenant + app registration available? | SSO fast-follow | Medplum-native login + TOTP MFA for go-live |
| Q-MS6 | Shared identity with MindScript users? | — | Separate logins in P1 |
| Q2 | Final role list (CRNA separate from anesthesia MD?) | T2 | One `anesthesia` role, `qualification` distinguishes |
