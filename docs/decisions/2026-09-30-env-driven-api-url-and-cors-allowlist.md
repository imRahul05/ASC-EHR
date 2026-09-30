---
status: accepted
date: 2026-09-30
decision-makers: 
---

# Env-driven API URL and CORS allowlist

## Context and Problem Statement

`apps/web` and `apps/api` are deployed as separate origins (Vercel today, Azure from P06). The first Vercel deploy exposed three gaps:

1. The web bundle silently fell back to `http://localhost:4000` because `NEXT_PUBLIC_API_URL` was unset at build time — visitors' browsers called their own machine and failed with a CORS error.
2. MSW mocking was hard-wired to development, so a hosted demo could not use the mock API even though the real API has no product routes yet.
3. `apps/api` had no CORS policy, so a real cross-origin call could never succeed.

We want a setup where moving between hosts (Vercel → Azure, adding staging) is configuration only.

## Decision

- **All connection settings are env vars validated in `@asc/config`**: `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_API_MOCKING` (web, build-time), `CORS_ORIGINS` (api, runtime). Code is identical in every environment.
- **Production web builds fail without `NEXT_PUBLIC_API_URL`** (`@asc/config/build-env`, called from `next.config.ts` in the production-build phase). No silent localhost default in a deployed bundle.
- **Mocking in production is an explicit opt-in** (`NEXT_PUBLIC_API_MOCKING=enabled`), for the hosted demo only. Development keeps mocking on by default.
- **CORS is an exact-origin allowlist** via `@fastify/cors`. Wildcards, paths and trailing slashes fail startup. Unset means `http://localhost:3000` in development/test and **no origins** when deployed (deny by default). No credentials: auth is a Bearer header held in memory, never a cookie.
- **Recommended topology on Azure**: custom subdomains of one parent domain (`app.` / `api.`). A reverse proxy serving the API under `/api` on the web origin is equally supported (`buildUrl` keeps a base path; CORS then unused).

### Options considered

- **Next.js rewrite proxy (`/api/*` → API) as the permanent solution** — removes CORS, but ties all API traffic to the web host and adds a hop; on Azure, Front Door does the same job at the edge. Kept as a documented alternative via a path-prefixed `NEXT_PUBLIC_API_URL`, not built in.
- **`origin: "*"` or reflecting any origin** — rejected: the API will serve PHI.
- **Regex/wildcard origins for Vercel previews** — rejected for now (YAGNI, easy to over-match); previews use the mock API or a stable branch alias.
- **Runtime-configurable API URL (fetched config instead of build-time inlining)** — more flexible, but adds a boot request and complexity; not needed while each environment has its own build.

## Consequences

- Good, because a missing API URL is a build error, not a production incident.
- Good, because moving to Azure is: set `NEXT_PUBLIC_API_URL`, `CORS_ORIGINS`, unset mocking, redeploy.
- Good, because deployed APIs reject cross-origin browsers unless explicitly configured.
- Bad, because `NEXT_PUBLIC_*` changes require a rebuild, and every new deployment origin must be added to `CORS_ORIGINS`.
- Neutral: if cookie-based sessions are introduced (P05, Medplum), revisit `credentials` and SameSite in a new ADR.

## Implementation Plan

- **Affected paths**: `packages/config/src/{env,public-env,build-env}.ts`, `apps/api/src/{app,server}.ts`, `apps/web/next.config.ts`, `apps/web/src/mocks/handlers/api-url.ts`, `packages/api-client/src/http.ts`, `turbo.json`, `.env*.example`.
- **Dependencies**: `@fastify/cors` (apps/api).
- **Operations guide**: [`docs/DEPLOYMENT_CONFIGURATION.md`](../DEPLOYMENT_CONFIGURATION.md).

### Verification

- [x] `@asc/config` tests cover origin parsing, wildcard rejection, default resolution, the mocking switch and the build guard.
- [x] `apps/api/src/app.test.ts` covers allowed/unlisted/empty-list preflights and simple requests.
- [x] `next build` fails without `NEXT_PUBLIC_API_URL`; with it plus `NEXT_PUBLIC_API_MOCKING=enabled`, demo login works in a production build.
