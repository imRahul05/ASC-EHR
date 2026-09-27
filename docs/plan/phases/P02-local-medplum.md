# P02 — Local Medplum stack + `apps/bots` skeleton + seed

| Field | Value |
|---|---|
| Wave · Lane · Size | 1 · Platform · M |
| Depends on | — |
| Unblocks | P04, P08, P12 (bots), P06 (config parity) |
| Source mix | MP |
| Requirements | ADR [adopt Medplum](../../decisions/2026-09-25-adopt-medplum-as-clinical-data-platform.md) |
| Branch | `phase/P02-local-medplum` |

## Goal
`pnpm db:up` (or `pnpm medplum:up`) starts a local Medplum server + admin app; a seed script creates the project, client applications, a facility `Organization`, and synthetic practitioners for each role.

## Out of scope
Access policies (P05), profiles/terminology (P08), Azure (P06).

## File structure
```text
docker-compose.yml                         EDIT  medplum-server (medplum/medplum-server:5.1.42), medplum-postgres, medplum-redis, medplum-app
infra/medplum/medplum.config.local.json    NEW   server config (baseUrl, db, redis, storage=local)
infra/medplum/client-apps.json             NEW   web (PKCE, redirect http://localhost:3000/signin/callback), api (on-behalf), worker (client-credentials)
apps/bots/package.json                     NEW   name "bots", scripts: seed, deploy, build
apps/bots/tsconfig.json · eslint.config.mjs NEW
apps/bots/esbuild.config.mjs               NEW   bundle each src/*.ts to dist/*.js (Medplum bot runtime)
apps/bots/scripts/seed-local.ts            NEW   idempotent: project, Organization(facility), Practitioners per role, ClientApplications
apps/bots/src/.gitkeep                     NEW
packages/config/src/env.ts                 EDIT  MEDPLUM_BASE_URL, MEDPLUM_CLIENT_ID, MEDPLUM_CLIENT_SECRET (server only)
packages/config/src/public-env.ts          EDIT  NEXT_PUBLIC_MEDPLUM_BASE_URL, NEXT_PUBLIC_MEDPLUM_CLIENT_ID
.env.example                               EDIT
package.json (root)                        EDIT  medplum:up / medplum:seed scripts
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Compose services + config JSON; health check | root / infra | `docker compose up medplum-server` healthy |
| T2 | Env schema additions (server + public) with tests | `@asc/config` | `parseEnv()` validates Medplum vars |
| T3 | `apps/bots` workspace skeleton (esbuild, lint, tsconfig) | `apps/bots` | `pnpm --filter bots build` works (empty) |
| T4 | Seed script (idempotent, synthetic names only) | `apps/bots` | `pnpm medplum:seed` |
| T5 | Docs: local setup section in ENVIRONMENTS doc | docs | runbook |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | T4 | T2, T3 |
| T2 | — | T4, P04 | T1, T3 |
| T3 | — | T4 | T1, T2 |
| T4 | T1, T2, T3 | P04, P05 | T5 |
| T5 | T1 | — | T4 |

## Packages to add
| Package | Version | Workspace |
|---|---|---|
| `@medplum/core` | 5.1.42 | `apps/bots` |
| `@medplum/fhirtypes` | 5.1.42 | `apps/bots` (dev) |
| `@medplum/cli` | 5.1.42 | `apps/bots` (dev) |
| `esbuild` | latest | `apps/bots` (dev) |

## Acceptance
- [ ] Fresh clone → `pnpm medplum:up && pnpm medplum:seed` → login to admin app works
- [ ] Seed re-run makes no duplicates
- [ ] No real names/DOBs in seed data
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q1 | Share one local Postgres container with `@asc/db` or separate? | T1 | Separate DBs, same container allowed (different databases) |
| Q2 | Docker image tag `5.1.42` exists? | T1 | Verify on Docker Hub; pin nearest 5.1.x and match npm packages |
