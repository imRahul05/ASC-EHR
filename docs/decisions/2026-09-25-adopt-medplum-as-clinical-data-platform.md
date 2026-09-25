---
status: proposed
date: 2026-09-25
decision-makers: Engineering lead, Product (pending ratification)
---

# Adopt Medplum as the clinical data platform (system of record)

## Context and Problem Statement

The GI ASC EHR must go live in early December 2026 with 12 Phase-1 modules (see `docs/product/01-requirements.md`). The repo today is a scaffold: Next.js, Fastify, BullMQ, shared packages, no database. The accepted ADR *Adopt Vercel AI SDK for Agent Orchestration* already assumes agents call "Medplum FHIR CRUD operations", but no ADR adopts Medplum.

Building a clinical store, auth/MFA, RBAC, PHI access audit, realtime subscriptions, HL7 v2/DICOM ingestion, binary storage and an admin console ourselves would consume most of the ~10 weeks and add accreditation/security risk, while adding no product differentiation.

## Decision Drivers

- Go-live date; minimize undifferentiated build
- HIPAA: access control and audit enforced at the data layer
- Stack fit: TypeScript, Node, Postgres, Redis (same as ours)
- Interop later (HL7/FHIR, labs, HIE, eCW bridge) without re-modelling
- Keep our UI design system (`@asc/ui`, shadcn/Base UI) and AI layer (`@asc/agents`)

## Considered Options

1. **Medplum (Apache-2.0), self-hosted on Azure** — FHIR R4 server, Auth (OAuth2/OIDC, MFA, SMART, external IdP), AccessPolicy, AuditEvent, Subscriptions, Bots, Binary storage (Azure Blob), on-prem Agent (HL7 v2 MLLP, DICOM C-STORE), Medplum App admin.
2. **Medplum-hosted (managed, BAA)** — same software, less ops, less control over hosting.
3. **Custom Postgres schema + Drizzle/Prisma** in `apps/api` — full control, build everything above ourselves.
4. **Other FHIR servers (HAPI FHIR, Azure Health Data Services)** — FHIR store only; still need auth UX, bots, agent, admin; HAPI is Java (off-stack).

## Decision Outcome

Chosen option: **1 — Medplum self-hosted on Azure**, with option 2 as the fallback if platform setup is not stable by the end of week 3.

Architecture rules that follow (detailed in `docs/product/03-target-architecture.md`):
- All clinical data lives in Medplum as FHIR resources, profiled in a new `@asc/fhir` package.
- Reads and simple writes: `apps/web` → Medplum directly with the user's token. Domain commands and AI: `apps/web` → `apps/api` → Medplum on-behalf-of the user.
- GI rules live in a new pure package `@asc/clinical-rules`, shared by web, api and bots.
- Small event reactions are Medplum Bots (new `apps/bots`); heavy/AI work goes to `apps/worker` via Subscription → API → BullMQ.
- `apps/web` uses headless `@medplum/react-hooks` + `@medplum/core`; `@medplum/react` (Mantine) is not used in the clinical app.
- `@asc/audit` continues to record business/agent events; PHI access audit is Medplum `AuditEvent`.
- Every resource is tagged with the facility `Organization` for future multi-site compartments.

### Consequences

- Good: removes auth, RBAC, audit, realtime, integration plumbing and admin UI from the Phase-1 build.
- Good: FHIR-native data makes P2 registry export and P3 interop mostly mapping work.
- Good: Medplum examples (provider app, tasks, intake, eligibility, eFax, labs, subscriptions, FSH profiles) are forkable starting points.
- Bad: we operate AKS + Postgres + Redis for Medplum (Terraform path is documented but demanding).
- Bad: FHIR modelling learning curve for the team; GI profiles must be designed carefully up front.
- Bad: Bots cannot import workspace packages directly — must be bundled; keep them thin.
- Bad: CPT is not bundled — requires our own AMA license and load.
- Neutral: version drift — pin versions and upgrade through staging.

### Confirmation

- Week 2: Medplum running in dev + staging on Azure, Entra SSO login, one AccessPolicy per role verified by automated tests.
- Week 3: a synthetic colonoscopy case flows scheduling → signed note → ChargeItem entirely through FHIR with AuditEvents visible.
- If either misses, trigger fallback option 2 and record a superseding ADR.

## More Information

- Medplum: https://github.com/medplum/medplum · Azure self-hosting: https://www.medplum.com/docs/self-hosting/install-on-azure · Agent: https://www.medplum.com/docs/agent
- Related: `2026-09-25-adopt-vercel-ai-sdk-for-agent-orchestration.md`, `2026-09-25-environment-lifecycle-and-deployment-strategy.md`
