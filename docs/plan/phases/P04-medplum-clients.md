# P04 — Medplum client wiring (web, api, worker)

| Field | Value |
|---|---|
| Wave · Lane · Size | 1 · Platform · S |
| Depends on | P02, P03 |
| Unblocks | P05, P10 |
| Source mix | MP |
| Requirements | 03 §2 request-path rule |
| Branch | `phase/P04-medplum-clients` |

## Goal
One client factory per context: browser (user token, PKCE), API (on-behalf-of the calling user), worker (scoped system client). Apps never construct `MedplumClient` themselves. The API factory takes **only the user's token**: there is no API service client, and the grant lookup (`PractitionerRole?practitioner=…&active=true`) also runs with the user's token ([#57](https://github.com/imRahul05/ASC-EHR/issues/57), decided 2026-10-09).

## Out of scope
Login UI and access policies (P05), SSE (P10).

## File structure
```text
packages/api-client/src/medplum/browser.ts     NEW  createBrowserMedplumClient(publicEnv)
packages/api-client/src/server.ts              NEW  subpath "@asc/api-client/server": createOnBehalfClient(token), createClientCredentialsClient(creds), forFacility
packages/api-client/src/medplum/facility.ts    NEW  forFacility(client, facilityId): stamps meta.accounts on create, update, patch
packages/api-client/src/react/provider.ts      NEW  AscMedplumProvider (wraps MedplumProvider + QueryClient; no Medplum client when unconfigured)
packages/api-client/package.json               EDIT exports: ".", "./server", "./react"; peerDeps react
apps/web/src/app/providers.tsx                 EDIT use AscMedplumProvider
apps/api/src/plugins/medplum.ts                NEW  decorate request.medplum (on-behalf) — token from Authorization header
apps/worker/src/medplum.ts                     NEW  createFacilityWorkerClient(facilityId) / clientForJob(data): one client per facility (#60)
apps/worker/src/clients.ts                     NEW  workerMedplum from the validated env (MEDPLUM_WORKER_CLIENTS)
packages/eslint-config/app.js                  EDIT MEDPLUM_WRITE_RULES; @asc/api-client/server banned in browser code
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Client factories + `/server` + `/react` subpaths, MockClient tests | `@asc/api-client` | factories |
| T2 | Web provider wiring | `apps/web` | app renders with provider |
| T3 | API Fastify plugin (`request.medplum`) | `apps/api` | plugin + test with MockClient |
| T4 | Worker system client | `apps/worker` | client module + test |
| T5 | Facility-scoped writes: `forFacility(id)` + lint rule | `@asc/api-client`, `@asc/eslint-config` | wrapper + tests + lint rule |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | T2, T3, T4 | — |
| T2 | T1 | P05 | T3, T4 |
| T3 | T1 | P05, P10 | T2, T4 |
| T4 | T1 | P10 | T2, T3 |
| T5 | T1 | every facility-scoped write (P12+) | T2, T3, T4 |

## Packages to add
| Package | Version | Workspace |
|---|---|---|
| `@medplum/core` | 5.1.42 | `@asc/api-client`, `apps/api`, `apps/worker` |
| `@medplum/react-hooks` | 5.1.42 | `@asc/api-client` (peer: react) , `apps/web` |
| `@medplum/mock` | 5.1.42 | dev in `@asc/api-client`, `apps/api`, `apps/worker` |
| `@tanstack/react-query` | 5.104.0 | align `apps/web` + `@asc/api-client` |

## Acceptance
- [x] Lint blocks `@asc/api-client/server` import from `apps/web` (P00 rule)
- [x] Client secret never reaches the browser bundle (check `next build` output grep)
- [x] The API server factory has no client-credentials path: it builds a client from the request's user token only, and a test fails if `apps/api` reads `MEDPLUM_CLIENT_SECRET` ([#57](https://github.com/imRahul05/ASC-EHR/issues/57))
- [x] Tests use `MockClient`, no live server
- [x] `forFacility(client, facilityId)` sets `meta.accounts` to the facility `Organization` on every create, update and patch, including a read-modify-write of a resource read without it (spike results ADR decision 1 and review amendments). A body that names a different facility is refused before the call
- [x] Lint rule: apps may not call `createResource`, `updateResource`, `patchResource` or `executeBatch` on a raw client for facility-scoped types; they go through `forFacility` (directory types listed as exempt in one place)
- [x] A test per write path proves the account is present (decision 1)
- [x] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q1 | On-behalf: forward user token vs token exchange | T3 | **Decided** ([#55](https://github.com/imRahul05/ASC-EHR/issues/55), 2026-10-09): forward the user access token (AccessPolicy + AuditEvent apply to the user) |

## P04 decisions (recorded at implementation)
1. **No default Medplum host.** Every factory requires an explicit base URL: Medplum's own default is its hosted service, which PHI must never reach. The browser factory returns no client when `NEXT_PUBLIC_MEDPLUM_BASE_URL` is unset (the demo keeps its mocks).
2. **Tokens in memory only, no response cache on servers.** Factories pass `ClientStorage(new MemoryStorage())` (LM-004; Node 25 also has a global `localStorage` stub that Medplum's default storage would pick up). Server and worker clients use `cacheTime: 0`, so a revoked grant is never served from a cache (#57).
3. **Worker credentials are per facility** (`MEDPLUM_WORKER_CLIENTS`, keyed by facility id, validated in `@asc/config` as one variable so no part of it reaches an error). `clientForJob` parses `phiJobDataSchema` and picks that facility's client; an unknown facility is an error, never a fallback (#60). Provisioning: PR #65.
4. **`forFacility` methods are `create`/`update`/`patch`/`transaction`**, so the lint rule flags every raw `createResource`/`updateResource`/`patchResource`/`executeBatch`/`upsertResource`/`createResourceIfNoneExist` in apps, and `new MedplumClient`. A patch may not touch `/meta` and always ends with `add /meta/accounts`. Directory types (`DIRECTORY_RESOURCE_TYPES`) are refused by `forFacility`; a directory writer for admin screens comes with its first use.
5. **Live proof:** `apps/bots/live/for-facility.live.ts`: create, a read-modify-write of a body read over plain HTTP, and a JSON patch all keep the facility on Medplum 5.1.42.
