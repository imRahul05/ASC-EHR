# Plan 09 — `P26` + `EP-A` admin + `EP-L` QAPI + platform leftovers (`P00b`, `P06`, `P09`, `P10`)

> These are separate PRs, listed in recommended order. **This is the software-freeze critical path (Nov 15, 2026).**
> Capabilities that already exist: `admin.users`, `admin.roles`, `admin.facility` (step-up), `audit.read`, `quality.read`, `breakglass.invoke` (step-up).
> UI that already exists: `features/admin/admin-console.tsx` (roster/rooms/blocks/agents), `features/quality/quality-dashboard.tsx`, `features/audit/audit-log.tsx`. Route patterns `admin`, `quality`, `audit`, `dashboardSummary` exist, but **there are no Fastify routes for them yet**.

---

## 9.1 `P10` realtime SSE (do early; P19/P24/whiteboard benefit)
Follow `docs/plan/phases/P10-realtime-sse.md` as written. Key point: tenant-scoped channels, auth on connect, no PHI in event payloads (ids + type only; the client refetches).

## 9.2 `P00b` library upgrades (zod 4, bullmq 6, ioredis 6)
Follow the phase file. Do it **before** the freeze and in its own PR. Run the full suite plus `pnpm eval`. Zod 4 changes (`.refine` typing, `z.string().email()` → `z.email()`, error map) must be recorded as an LM if you hit them.

## 9.3 `EP-A` master admin (US-A-01..06) — branch `feat/epa-master-admin`
1. Types/validation: `FacilityProfile` (NPI, CCN, TIN, timezone, hours), `ProcedureRoom` and `RecoveryBay` (capabilities, active), `ProviderCredential` (NPI Luhn check, licence, DEA, **privilege expiry**), `ProcedureCatalogItem` (CPT, default minutes, turnover, prep), `PayerMaster` (clearinghouse payer id, auth-required CPT list), `PreferenceCard`.
2. Rules: `admin/privileges.ts` — an expired privilege **blocks** `note.sign`, timeout participation and case booking as surgeon (US-A-03). Wire it into `signGate` and booking.
3. FHIR: `Organization`/`Location`/`PractitionerRole`/`PlanDefinition`(catalog)/`InsurancePlan` builders.
4. API `routes/admin.ts`: CRUD with `admin.facility` (step-up) and an audit row on every change (who, before/after hash). Add `GET /admin` (`AdminOverview`).
5. Web: extend the `AdminConsole` tabs (facility, providers, catalog, payers, preference cards). Move the hard-coded room list `ASC_ROOM_IDS` / `schedule-options.ts` to read from the room master (keep the constant as a seed fallback).

## 9.4 `EP-L` QAPI and quality (US-L-01..10) — branch `feat/epl-qapi`
**Citations:** CMS ASCQR program (ASC-9/ASC-12 measures, ASC-1..4 adverse outcomes), **42 CFR §416.43** QAPI, ASGE/ACG 2015 & 2022 QIs (ADR ≥25% overall (≥30% M / ≥20% F per 2015, ≥35%/≥25% per 2024 update; make the thresholds config), cecal intubation ≥95% screening, withdrawal ≥6 min, BBPS adequacy ≥85%).
1. Rules `quality/metrics.ts` (pure): ADR per endoscopist (screening colonoscopies in patients ≥45 with ≥1 adenoma, using P23 histology), CIR, mean withdrawal (P18), BBPS adequacy (P19), perforation/bleeding rates (P25), transfers, and ASC-9/ASC-12 (appropriate surveillance interval, from P23).
2. Recall `quality/recall.ts`: due list from surveillance `CarePlan`s → `recall_due` work item (add the type to all 4 maps as in Plan 05/P21).
3. API `routes/quality.ts`: `GET /quality?from&to` (`quality.read`) computed from FHIR (cache 5 min). `GET /quality/ascqr-export` (CSV). `GET /dashboard/summary`.
4. Web: point `QualityDashboard` at real data and add a recall worklist filter.

## 9.5 `P26` go-live hardening — branch `phase/P26-golive`
1. **Audit report** (`audit.read`): `GET /audit` (filters as in the UI) + `GET /audit/export` (CSV, step-up). Every PHI read is already audited by P05f; verify coverage with a test that hits each case route and asserts an audit row exists (**HIPAA §164.312(b)**).
2. **Break-glass** (US-A-08, `breakglass.invoke` step-up): `POST /break-glass` {patientId, reason ≥20 characters} → a 1-hour elevation grant (Medplum access policy `infra/medplum/access-policies/break-glass.json`) + a high-priority audit event + notification to the privacy officer. Auto-expire it. Add a banner in the UI while it is active. **HIPAA §164.312(a)(2)(ii)** emergency access.
3. **Downtime packet** (US-E-11, NFR "zero fallback"): `apps/worker/src/jobs/downtime-packet/` generates, every night plus on demand, an encrypted PDF of the next-day schedule, allergies, meds, consent status, readiness and blank paper forms. Download it from `/admin`, which requires step-up. Write the runbook `docs/runbooks/downtime.md` (paper → re-entry reconciliation).
4. **Next-day readiness huddle view** (US-E-11): `/huddle` page showing tomorrow's cases with blocked readiness checks (reuse `computeOverallReadiness`).
5. **Envs:** `P06` Terraform dev, staging and prod (blocked on Azure subscription + BAA → GitHub issue). Write `docs/runbooks/{backup-restore,go-live}.md`, and do a restore drill once.
6. **E2E:** Playwright `apps/web/e2e/mock-clinic-day.spec.ts`: referral → register → book → eligibility → pre-op → consent → Gate 1 → timeout → events → Gate 2 → note sign → PACU → discharge → coding attest → 837 export → pathology → letter. Run it in CI nightly.
7. **Perf/NFR check:** p95 <500 ms on intra-op event saves (NFR-2); load test 4 rooms × 30 cases/day with k6 (`perf/k6/clinic-day.js`).
8. **Security:** run the `security-auditor` subagent over `apps/api` and fix the findings. Dependency audit (`pnpm audit --prod`). Run the `phi-review` skill over logs.

## Done when
The mock clinic-day E2E is green in CI, the downtime packet prints, the break-glass audit is visible, the ASCQR CSV exports, and the go-live runbook is signed off by Anurag.
