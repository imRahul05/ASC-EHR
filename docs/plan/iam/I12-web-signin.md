# I12 — Web sign-in: tenant middleware, PKCE, token handler, timeouts, logout

| Field | Value |
|---|---|
| Track · Size | B · M |
| Depends on | I05, I06, I10, I11, P04 |
| Unblocks | I13, I17, P12, P14 |
| Requirements | M12-3 (session timeout), 08 §5.1 |
| Branch | `phase/I12-web-signin` |

## Goal
Staff sign in on `{tenant}.<apex>` with Medplum (PKCE, password + TOTP, or later SSO). Access token lives in memory; refresh token in an encrypted `httpOnly` cookie read only by the web token handler. Idle 15 min and absolute 12 h are enforced. Logout clears everything. Mock auth remains only in the explicit demo build.

## Out of scope
MFA enrolment UI and step-up (I13), SSO (I21), patient login (I23).

## File structure
```text
apps/web/src/proxy.ts (or middleware.ts per Next 16)   NEW   host → tenant (registry API, cached); unknown → 404; unauthenticated → /login (no PHI in URL)
apps/web/src/app/(auth)/login/page.tsx                 EDIT  email → startLogin(projectId, PKCE)
apps/web/src/app/(auth)/signin/callback/page.tsx       NEW   code → token handler
apps/web/src/app/auth/token/route.ts                   NEW   exchange, refresh, logout; sets/clears cookie
apps/web/src/lib/session/*                             NEW   in-memory access token, silent refresh, idle timer
packages/api-client/src/medplum/browser.ts             EDIT  MedplumClient with in-memory storage
packages/config/src/env.ts · public-env.ts             EDIT  cookie secret (server), apex domain (public)
apps/web/src/mocks/**                                  EDIT  auth handlers only registered when NEXT_PUBLIC_API_MOCKING=enabled
docs/DEPLOYMENT_CONFIGURATION.md                       EDIT  auth env, cookie, domains
```
Check `node_modules/next/dist/docs` for the Next 16 middleware/proxy file name before C1 (LM-008).

## Commit plan
| # | Commit | ~Lines |
|---|---|---|
| C1 | `feat(web): resolve tenant from host in middleware` | 110 |
| C2 | `feat(config): add session cookie secret and apex domain env` | 50 |
| C3 | `feat(api-client): browser Medplum client with in-memory storage` | 60 |
| C4 | `feat(web): start PKCE login for the host tenant` | 120 |
| C5 | `feat(web): token handler exchange with httpOnly refresh cookie` | 140 |
| C6 | `feat(web): sign-in callback page` | 70 |
| C7 | `feat(web): silent refresh with in-memory access token` | 120 |
| C8 | `feat(web): idle and absolute session timeouts` | 120 |
| C9 | `feat(web): logout clears Medplum session, cookie and cache` | 70 |
| C10 | `feat(web): load principal from /me after sign-in` | 80 |
| C11 | `refactor(web): register mock auth only in demo builds` | 60 |
| C12 | `test(web): build fails if mock auth ships without demo flag` | 60 |
| C13 | `docs(deploy): document auth env, cookies and domains` | 60 |

## Cookie and token rules
| Item | Rule |
|---|---|
| Refresh cookie | `httpOnly`, `Secure`, `SameSite=Strict`, path `/auth`, encrypted, ≤ 12 h absolute |
| Access token | JS memory only (LM-004), sent as Bearer to API and Medplum |
| Idle | 15 min no activity → refresh refused server-side, client signs out |
| Logout | Medplum logout + clear cookie + `queryClient.clear()` + navigate `/login` |

## Checklist
- [ ] Token on host A cannot be used on host B (API test from I11 + web e2e/manual)
- [ ] No token, profile or PHI in `localStorage`/`sessionStorage`/URL (test + grep)
- [ ] Refresh cookie never sent to `apps/api` (path + origin)
- [ ] Idle and absolute timeouts tested with fake timers
- [ ] Demo build still works with `NEXT_PUBLIC_API_MOCKING=enabled`; production build without it contains no mock auth (C12)
- [ ] Page loads in `pnpm dev` against local Medplum (LM-005); bundle budgets pass
- [ ] Green at every commit; PROGRESS.md updated
