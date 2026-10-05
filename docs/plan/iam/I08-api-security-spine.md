# I08 — API security spine (default-deny, tenant, authn port, guards, `/me`)

| Field | Value |
|---|---|
| Track · Size | A · M |
| Depends on | I01, I06, I07 |
| Unblocks | I11, I17, every clinical API route (P12, P14, …) |
| Requirements | M12-2, 08 §6 gates 1–4 |
| Branch | `phase/I08-api-security-spine` |

## Goal
`apps/api` is **default-deny** before the first PHI route exists: every request passes tenant (gate 1), identity (gate 2, through `IdentityPort`), facility (gate 3) and capability (gate 4) checks, and denials are audited. The real Medplum adapter is plugged in by I11; until then a fake adapter is used in tests and refused in production.

## Out of scope
Medplum adapter (I11), step-up (I13), durable audit store (I14), clinical routes.

## File structure
```text
apps/api/src/plugins/security.ts        NEW   @fastify/helmet + @fastify/rate-limit (key tenant:user, fallback ip)
apps/api/src/plugins/tenant.ts          NEW   host → tenant via @asc/db registry; 404 unknown/inactive
apps/api/src/plugins/authn.ts           NEW   Bearer → IdentityPort.resolve → request.principal; 401
apps/api/src/plugins/default-deny.ts    NEW   onRoute hook: route must declare config.auth = "public" | { capability, facility? }
apps/api/src/guards/require-capability.ts NEW preHandler: authorize() → 403 + audit denied (gate 3/4)
apps/api/src/routes/me.ts               NEW   GET /me → Principal (meResponseSchema)
apps/api/src/composition.ts             NEW   picks IdentityPort by env; refuses fake in production
apps/api/src/app.ts                     EDIT  register plugins in order: security → tenant → authn → routes
apps/api/src/__tests__/route-inventory.test.ts   NEW  every route declares auth; lists public routes
apps/api/src/__tests__/authz-gates.test.ts       NEW  401/403/404 matrix incl. cross-tenant ID tampering
packages/validation/src/authz.ts        EDIT  route auth config schema (if shared)
```

## Commit plan
| # | Commit | ~Lines |
|---|---|---|
| C1 | `chore(api): add helmet security headers` | 40 |
| C2 | `chore(api): add rate limiting keyed by tenant and user` | 70 |
| C3 | `feat(api): resolve tenant from host, 404 on unknown` | 120 |
| C4 | `feat(api): authenticate bearer token through IdentityPort` | 130 |
| C5 | `feat(api): default-deny routes without auth config` | 100 |
| C6 | `test(api): route inventory lists every public route` | 60 |
| C7 | `feat(api): add requireCapability and facility guards` | 130 |
| C8 | `feat(api): audit denied requests with gate number` | 70 |
| C9 | `feat(api): add GET /me returning the principal` | 70 |
| C10 | `feat(api): refuse fake identity adapter in production` | 50 |
| C11 | `test(api): cross-tenant and cross-facility tampering cases` | 150 |
| C12 | `docs(api): security spine and how to declare route auth` | 60 |

## Behaviour tests must prove
| Case | Expect |
|---|---|
| No Bearer on non-public route | 401, audit `auth.denied` gate 2 |
| Unknown host | 404 (no login hint) |
| Token for tenant A on tenant B host | 401 |
| Valid user, missing capability | 403, audit gate 4 |
| Capability held only at facility B, target in A | 403, audit gate 3 |
| Resource id from another tenant in path | 404 (same as not found) |
| Route registered without `config.auth` | app fails to start (test) |
| `/health` | public, listed in inventory |

## Packages to add
| Package | Version | Workspace |
|---|---|---|
| `@fastify/helmet` | 13.1.1 | `apps/api` |
| `@fastify/rate-limit` | 11.2.0 | `apps/api` |

## Checklist
- [ ] Tenant never read from body/query/headers other than `Host` (and token in I11)
- [ ] Guards use `@asc/authz` `authorize()`; no role names in `apps/api` (lint)
- [ ] CORS ADR unchanged (bearer only, no cookies to API)
- [ ] Rate-limit and helmet settings documented in `docs/DEPLOYMENT_CONFIGURATION.md`
- [ ] `phi-review` run (errors and audit contain no PHI)
- [ ] Green at every commit; PROGRESS.md updated

## Open questions
| ID | Question | Default |
|---|---|---|
| Q-I08-1 | Local dev host when no subdomain (`localhost`) | Registry maps `localhost` → dev tenant in dev only |
