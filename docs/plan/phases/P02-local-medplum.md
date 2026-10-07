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

## P02 decisions (2026-10-07)

Recorded here so the next Medplum agent (P04, P05h, P08) finds them. Evidence (commands, test names) lives in the P02 PR; the acceptance list above stays unticked, as for the P05 sub-phases.

1. **Image and versions (Q2).** `medplum/medplum-server:5.1.42` and `medplum/medplum-app:5.1.42` exist on Docker Hub (multi-arch), matching the npm packages `@medplum/core`, `fhirtypes` and `cli` at 5.1.42. The server image is distroless: no shell and no curl, so its healthcheck is a `node -e fetch(...)` and its default config cannot be inspected inside the container. Config keys come from the Medplum docs; the server reads `medplum.config.json` from `/usr/src/medplum` (mounted at two paths, as `packages/server/` also looks).
2. **Own containers (Q1).** Medplum gets its own Postgres 16 and Redis 7 (`medplum-postgres`, `medplum-redis`), not a second database in the `@asc/db` container: a Medplum upgrade or reset never touches app data, and the reset commands in the runbook cannot reach `@asc/db`.
3. **Host ports are unusual on purpose**: 5443 (Postgres), 6390 (Redis), 8203 (API), 3003 (admin app), all on `127.0.0.1`. Developer machines commonly already run Postgres on 5432, Redis on 6379, Medplum on 8103 and something on 3000. Inside the compose network the services keep their normal ports.
4. **Hardening flags are on locally from day one**: `registerEnabled: false`, `saveAuditEvents: true`, `storeBotInput: false` (P05h adds the test that every environment keeps them). Local `binaryStorage` is `file:` on a named volume (no MinIO). The dev super admin (`admin@example.com` / `medplum-dev-only`) comes from `defaultSuperAdminEmail`/`Password`: dev-only, committed on purpose, and deployed environments take theirs from secrets.
5. **Seeding goes through the API, as the super admin.** `Project/$init` creates the project (owner = the super admin, who gets a project membership), and writes happen inside that project after choosing the membership. Facts learned from the live server that the next agent should not rediscover: a ClientApplication created through the API has **no secret** (the seed sets one, once, and never rotates it); client credentials then work only with a **ProjectMembership** for the application; login is **throttled to 5 per window**, so the seed logs in once (twice on the very first run) and chooses memberships with `auth/profile`; under Node the client needs an explicit in-memory storage (Node 25's global `localStorage` has no API without a flag) and a supplied PKCE challenge (the client's own hashing uses a browser API).
6. **Idempotent by construction.** Every create is conditional (`identifier=urn:asc-ehr:seed|<key>` or an exact name search); unit tests run the seed twice against an in-memory fake and assert one resource per key, stable ids and stable secrets, and a from-scratch run plus a second run produced identical ids and secrets on the real stack. Medplum adds its own practitioner (*Admin*) and *Default Client* application when it creates a project: not duplicates of the seed's.
7. **The seed refuses anything but loopback** (`seedEnvSchema` in `@asc/config`): it cannot be pointed at a shared or deployed Medplum. Seed output (ids and the generated secrets) goes to `apps/bots/.seed-output.json`, git-ignored, mode 600, and secrets are never printed.
8. **Synthetic only.** Practitioners are *Synthetic Demo-<role>* (one per staff role template, so a new role is seeded without editing the script; the patient portal role gets none), the facility is *Demo Surgery Center (synthetic)*, all tagged `urn:asc-ehr:seed|synthetic`; no dates of birth, contacts or addresses (tested).
9. **Not done here.** No access policies, no users or memberships for the practitioners, no facility policy test (P05h); no `deploy` script in `apps/bots` until the first bot exists (P08/P12); Medplum clients in the apps (P04). The server-side `MEDPLUM_*` and the public `NEXT_PUBLIC_MEDPLUM_*` variables are validated in `@asc/config` and documented, but nothing reads them yet. The public ones have no localhost fallback (LM-010).

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q1 | Share one local Postgres container with `@asc/db` or separate? | T1 | **Decided: separate containers** (decision 2) |
| Q2 | Docker image tag `5.1.42` exists? | T1 | **Yes**, server and app, multi-arch (decision 1) |
