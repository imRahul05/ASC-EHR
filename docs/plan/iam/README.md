# IAM — index (auth, roles, permissions, tenancy)

> **Status:** 2026-10-05. Plan of record: [P05 — Auth & Roles](../phases/P05-auth-roles.md) (sub-phases P05a–P05j).
> **Design:** [08 identity, access, tenancy](../../product/08-identity-access-and-tenancy.md) · [ADR](../../decisions/2026-10-03-medplum-as-identity-and-access-platform.md) (proposed) · [future multi-tenancy](../../product/future-multi-tenancy-architecture.md) · [before/after diagrams](before-after-architecture.md).

## 1. Approach in one paragraph

Build a **small, modular auth core** for the first hospital, not complete multi-tenant SaaS auth. Identity, tenant, role, capability and UI workspace are separate concepts behind small ports (`IdentityPort`, `TenantResolver`). Code checks capabilities per facility, never role names. Roles are versioned data compiled to Medplum `AccessPolicy`. Data carries `tenant_id` + facility from day one, but one tenant runs. Everything else (step-up, SSO, break-glass, worker and stream auth, multi-tenancy) starts at an explicit gate ([P05 §6](../phases/P05-auth-roles.md#6-gated-follow-ups-not-in-p05-start-no-later-than-the-gate)).

The earlier 18-phase IAM track (I00–I17) was folded into P05 on 2026-10-05. Its per-commit detail stays in git history (`git show be210c9:docs/plan/iam/I01-authz-core.md`, …) for anyone who wants more depth on a sub-phase.

## 2. Design corrections and where they land

| ID | Correction | Lands in |
|---|---|---|
| D-A1 | `Principal` carries per-facility grants; `can(p, cap, { facilityId })` checks only grants for that facility (no flat capability set) | P05a |
| D-A2 | `RoleKey` is a string validated against templates; `Capability` is a closed union | P05a, P05b |
| D-A3 | Capability catalog is an `as const` tuple in `@asc/types`; logic in pure `@asc/authz` | P05a |
| D-A4 | Workspace layer: persona = label, role = authz group, capability = permission, workspace = UI from capabilities | P05b (resolver), P05d (UI) |
| D-A5 | Role lifecycle fields: immutable `key`, free `label`, `version`, `status` | P05b; tooling gated (P05 §6) |
| D-A6 | Role templates are repo-defined, versioned data for Phase 1 | P05b |
| D-A7 | Role list: `front-desk`, `rn`, `tech`, `gi-physician`, `anesthesia` (MD/CRNA via qualification), `coder`, `admin`, `auditor` + `patient` | P05b |
| D-A8 | Audit: Medplum `AuditEvent` for FHIR access (`saveAuditEvents: true`); append-only Postgres `audit_events` for IAM/API events | P05f, P05h |
| D-A9 | Numbers: `/auth/me` cache ≤ 60 s, idle 15 min, absolute 12 h, step-up window 5 min | P05i, P05j; step-up gated |
| D-A10 | Tenant-ready, one tenant: `tenant_id` + RLS, facility in `meta.accounts`, `StaticTenantResolver`; staff at two customers get two accounts | P05a, P05e |
| D-A11 | Scope cut: multi-tenant routing, registry, provisioner, cross-tenant suite wait for Customer #2 | [future doc](../../product/future-multi-tenancy-architecture.md) |
| D-A12 | Medplum hardened, not on defaults: `registerEnabled: false`, `saveAuditEvents: true`, `storeBotInput: false`, explicit super-admin credentials | P05h, P06 |
| D-A13 | Medplum assumptions proven before use: spikes S1, S1b, S6, S7 and a policy test against local Medplum | P05h |
| D-A14 | Identity-provider flexibility, not Medplum portability: enterprise IdPs federate into Medplum, which keeps issuing the token gate 5 checks; leaving Medplum is a re-platform | ADR item 5, 08 §2.3 |
| D-A15 | Authorization freshness: identity cache ≤ 60 s, bypassed for step-up capabilities, invalidated by our admin actions and a Medplum membership Subscription; fail closed | P05i, 08 §6 |
| D-A16 | AI agents are principal kind `agent`: caller's capabilities ∩ agent allow-list, data scoped to the run; workers use their own client | P05a, 08 §9 |
| D-A17 | Decision provenance in audit: role template versions, catalog version, gate, cache state | P05f, 08 §12.3 |
| D-A18 | Hybrid token handling (httpOnly refresh cookie, ≤ 15 min in-memory access token, strict CSP); full BFF only if required | P05j, ADR item 6 |
| D-A19 | Compliance is an operating programme we own; hosting under a BAA is not compliance | P26 |

## 3. Commit rules

Every P05 sub-phase follows [incremental-commits §4](../../agent/incremental-commits.md#4-size-limits-and-commit-shape):

1. One concern and one workspace per commit (exception: contract change + minimal consumer fix).
2. Target ≤ 150 changed lines, hard cap 400 (excluding lockfiles, generated snapshots, generated SQL).
3. Green at every commit: `pnpm turbo run lint check-types test --filter=<touched workspaces>`; web changes also load in `pnpm dev`.
4. Tests in the same commit as the code they prove.
5. Expand → migrate callers → contract for DB columns and shared types.
6. No role-name comparisons outside `@asc/authz` (lint).
7. `PROGRESS.md` changes in their own `chore(progress)` commits.
