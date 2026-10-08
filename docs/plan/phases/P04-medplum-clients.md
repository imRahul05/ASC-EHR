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
One client factory per context: browser (user token, PKCE), API (on-behalf-of the calling user), worker (scoped system client). Apps never construct `MedplumClient` themselves.

## Out of scope
Login UI and access policies (P05), SSE (P10).

## File structure
```text
packages/api-client/src/medplum/browser.ts     NEW  createBrowserMedplumClient(publicEnv)
packages/api-client/src/server.ts              NEW  subpath "@asc/api-client/server": createOnBehalfClient(token), createSystemClient(creds)
packages/api-client/src/react/provider.tsx     NEW  AscMedplumProvider (wraps MedplumProvider + QueryClient)
packages/api-client/package.json               EDIT exports: ".", "./server", "./react"; peerDeps react
apps/web/src/app/providers.tsx                 EDIT use AscMedplumProvider
apps/api/src/plugins/medplum.ts                NEW  decorate request.medplum (on-behalf) — token from Authorization header
apps/worker/src/medplum.ts                     NEW  system client from parseEnv()
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Client factories + `/server` + `/react` subpaths, MockClient tests | `@asc/api-client` | factories |
| T2 | Web provider wiring | `apps/web` | app renders with provider |
| T3 | API Fastify plugin (`request.medplum`) | `apps/api` | plugin + test with MockClient |
| T4 | Worker system client | `apps/worker` | client module + test |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | T2, T3, T4 | — |
| T2 | T1 | P05 | T3, T4 |
| T3 | T1 | P05, P10 | T2, T4 |
| T4 | T1 | P10 | T2, T3 |

## Packages to add
| Package | Version | Workspace |
|---|---|---|
| `@medplum/core` | 5.1.42 | `@asc/api-client`, `apps/api`, `apps/worker` |
| `@medplum/react-hooks` | 5.1.42 | `@asc/api-client` (peer: react) , `apps/web` |
| `@medplum/mock` | 5.1.42 | dev in `@asc/api-client`, `apps/api`, `apps/worker` |
| `@tanstack/react-query` | 5.104.0 | align `apps/web` + `@asc/api-client` |

## Acceptance
- [ ] Lint blocks `@asc/api-client/server` import from `apps/web` (P00 rule)
- [ ] Client secret never reaches the browser bundle (check `next build` output grep)
- [ ] Tests use `MockClient`, no live server
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q1 | On-behalf: forward user token vs token exchange | T3 | Forward user access token (AccessPolicy + AuditEvent apply to the user) (confirm: [#55](https://github.com/imRahul05/ASC-EHR/issues/55)) |
