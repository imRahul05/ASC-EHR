# Single-Facility Day-1 Architecture, Progressive Mounting, and Lockstep Mock Alignment

> **Status:** Accepted  
> **Date:** 2026-10-14  
> **Author:** Antigravity Architect (grounded in Anurag Chatterjee's *Master Build Specification* & *Requirements Document*)  
> **Decides:** Tenancy simplification for Day 1, preservation and progressive mounting of UI features, and lockstep mock alignment.  
> **Related:** [08 Identity, Access Control & Tenancy](../product/08-identity-access-and-tenancy.md) · [Future Multi-Tenancy Architecture](../product/future-multi-tenancy-architecture.md) · [07 Mock Frontend](../product/07-mock-frontend.md) · [09 Clinical Safety & Stage-Readiness](../product/09-clinical-safety-and-stage-readiness.md)

---

## 1. Context & Problem Statement

Anurag Chatterjee's *ASC OS Requirements Document* (`[REQ-1:9]`, `[REQ-22:1011-1035]`) and *Master Build Specification* clarify that ASC OS is the operating system for a single-specialty Gastrointestinal (GI) Ambulatory Surgery Center (Place of Service 24). It is **not** a general hospital and does not have overnight beds, emergency departments, or multi-department hospital wards.

Key constraints from the specification:
1. **Single-Facility Go-Live (`[REQ-1:9]`, `[REQ-3:80]`):** The surgery center operates as a single physical facility on opening day. Every user belongs to this facility.
2. **Tenancy Data-Model Rule (`[REQ-22:1013]`):** *"The data model should carry a facility identifier on every record from day one even though only one facility exists, because retrofitting tenancy is expensive and the center may add a second room block or a second site."*
3. **Avoid Over-Engineering Multi-Tenancy (`[REQ-22:1034]`):** Open Question 12 explicitly recommends: *"Build for a single tenant with a facility identifier on every record. Do not build tenant isolation, multi-tenant billing, or white-labeling until a second customer exists."*
4. **Codebase Gaps Identified:**
   - In `packages/db/src/tenant.ts`, queries were forced through a transaction wrapper `tenantDb.withTenant(tenantId)` calling `SELECT set_config('app.tenant_id', ...)`. In a single-facility environment, this pinned connection pools, caused round-trip latency, and triggered artificial crashes (`AuditTenantMissingError`).
   - In `apps/web/src/lib/stores/auth.store.ts`, signing in with global scope set `facilityId: null`, permanently disabling the "Book Case" button because it waited for a multi-facility selection that did not exist.
   - Premature Phase 2 screens (like the patient portal `/my-care`) and MSW mock routes were mounted in the UI before their corresponding Fastify backend routes existed, causing unhandled 404 errors against the live API.

---

## 2. Decision

### Decision 1: Single-Facility Day-1 Architecture with Future-Proof Records
- **Data Model:** Keep `facility_id` (and default `tenant_id`) on all database tables in `packages/db` and in FHIR R4 `meta.accounts = ["Organization/<facilityId>"]`.
- **Database Access Simplification:** Retire the runtime session variable hook `SELECT set_config('app.tenant_id', ...)` in `@asc/db`. Standard application queries filter directly by `facility_id`, avoiding connection pool pinning and maximizing throughput on serverless/pooled PostgreSQL (Neon/PgBouncer).
- **Auto-Resolve Facility Context (`resolveActiveFacility`):** Separate concerns cleanly: **grants** define capabilities (*what* you can do), while **`me.facilities`** is the sole source of truth for accessible locations (*where* you can work). The client resolves the active facility with explicit priority: (1) valid persisted/last-used facility, (2) server-specified default facility, (3) primary facility if only one exists. If `facilityId` is null (misconfigured user), the UI renders an explicit *"No facility assigned"* message rather than letting a nullable ID reach mutation forms. The manual `FacilitySwitcher` dropdown is rendered only when `facilities.length > 1`.
- **Future Multi-Tenancy Reference:** The existing blueprint at [`docs/product/future-multi-tenancy-architecture.md`](../product/future-multi-tenancy-architecture.md) remains the authoritative architectural guide for adding multi-site routing, tenant registries, and cross-facility credentialing in Phase 2.

### Decision 2: Progressive UI Mounting (Preserve Without Deletion)
- **Zero Deletions for Dormant Features:** Code built for Phase 2 (such as `apps/web/src/features/portal/` containing `my-care-view.tsx`, `escort-form.tsx`, `prep-checklist.tsx`, etc.) will **not** be deleted. It remains in the codebase as dormant assets for Phase 2.
- **Unmount from Active App Router:** The route `apps/web/src/app/(dashboard)/my-care/page.tsx` and its sidebar navigation links are unmounted. Next.js 16 App Router tree-shakes and completely excludes unmounted components from the production bundle build (`next build`), ensuring zero bundle bloat and zero console warnings.
- **Mount in Lockstep with APIs:** As each clinical phase is completed (P15c Case Workspace, P17 Pre-Op Consent, P16 Medical Review), its frontend routes will be mounted in the App Router alongside its tested backend APIs.

### Decision 3: Lockstep Mock & Demo Alignment
- Maintain MSW (Mock Service Worker) handlers in `apps/web/src/mocks/` in strict lockstep with mounted clinical routes.
- When developers or stakeholders run with `NEXT_PUBLIC_API_MOCKING=enabled`, all active clinical workflows (whiteboard, schedule, registration, case workspace) operate seamlessly with consistent simulated data.
- Whenever a live backend API is built or modified, its MSW mock counterpart is updated in the same pull request.

---

## 3. Consequences

### Positive
- **Zero Connection-Pool Pinning:** Standard parameterized SQL executes cleanly without transaction-local session state, improving performance on Neon/PgBouncer.
- **No Disabled Button Bugs:** The "Book Case" and scheduling actions are immediately functional upon login.
- **Clean Bundle Size:** Unmounted Phase 2 features are excluded from the client JavaScript bundle.
- **Preserved Investment:** Hundreds of lines of patient portal components remain safely preserved for Phase 2 without rewriting.
- **Clear Expansion Path:** Adding a second endoscopy center or room block in Phase 2 requires no database table rewrites because `facility_id` is already present everywhere.

### Negative / Trade-offs
- Developers adding new database tables must remember to include `facility_id` manually without relying on an automated RLS session hook.
- When Phase 2 multi-tenancy is activated, the tenant registry and dynamic host resolver from `future-multi-tenancy-architecture.md` will need to be re-instated.
