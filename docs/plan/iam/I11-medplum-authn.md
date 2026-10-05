# I11 — Medplum `IdentityPort` and real API authentication

| Field | Value |
|---|---|
| Track · Size | B · M |
| Depends on | I08, I10, P04 |
| Unblocks | I12, I13, I14, P12, P14 |
| Requirements | M12-2, 08 §6 gate 2 |
| Branch | `phase/I11-medplum-authn` |

## Goal
`apps/api` turns a Medplum access token into a `Principal` with per-facility grants, checks the token's Project matches the host's tenant, rejects inactive memberships, and caches the result ≤ 60 s. The fake adapter from I08 stays for tests only.

## Out of scope
Web login (I12), step-up (I13), worker identity (deferred I18).

## File structure
```text
packages/api-client/src/server/auth-me.ts         NEW   fetchAuthMe(token) via @medplum/core (server subpath)
packages/authz/src/membership-to-principal.ts     NEW   pure: authMe payload + templates → Principal (grants per facility)
packages/authz/src/membership-to-principal.test.ts NEW  uses S7 fixture
apps/api/src/adapters/medplum-identity.ts         NEW   IdentityPort impl: fetchAuthMe + map + cache
apps/api/src/adapters/principal-cache.ts          NEW   key = sha256(token), TTL ≤ 60 s, max entries
apps/api/src/composition.ts                       EDIT  production uses MedplumIdentity
apps/api/src/__tests__/medplum-identity.int.test.ts NEW skipped without MEDPLUM_TEST_URL
```

## Commit plan
| # | Commit | Workspace | ~Lines |
|---|---|---|---|
| C1 | `feat(api-client): server helper to fetch auth me` | `@asc/api-client` | 70 |
| C2 | `feat(authz): map membership access to per-facility grants` | `@asc/authz` | 140 |
| C3 | `test(authz): mapping cases from recorded auth me fixture` | `@asc/authz` | 120 |
| C4 | `feat(api): principal cache keyed by token hash` | `apps/api` | 90 |
| C5 | `feat(api): Medplum identity adapter` | `apps/api` | 110 |
| C6 | `feat(api): reject token whose project is not the host tenant` | `apps/api` | 60 |
| C7 | `feat(api): reject inactive membership` | `apps/api` | 40 |
| C8 | `feat(api): use Medplum identity in production composition` | `apps/api` | 40 |
| C9 | `test(api): integration against local Medplum` | `apps/api` | 140 |

## Tests must prove
- Unknown policy name in membership (not from a template) → membership ignored + audit warning; never mapped to capabilities.
- `retired` template version still referenced → no capabilities (fail closed) + alert event.
- Membership with two facilities → two grants; `scope: all` for templates with `facilityScoped: false`.
- Expired/invalid token → 401; Medplum unavailable → 503 (not 401, not allow).
- Cache never stores the raw token; entries expire ≤ 60 s.

## Checklist
- [ ] API calls Medplum with the **user's** token for on-behalf FHIR work (P04 Q1)
- [ ] No token or profile data in logs (`phi-review`)
- [ ] Integration test documented in `apps/api/README.md` with the env var to run it
- [ ] Green at every commit; PROGRESS.md updated
