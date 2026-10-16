# ASC EHR — Gastrointestinal Ambulatory Surgery Center Operating System

[![Monorepo: Turborepo](https://img.shields.io/badge/Monorepo-Turborepo-ef4444.svg)](https://turbo.build/repo)
[![Next.js 16](https://img.shields.io/badge/Web-Next.js%2016%20App%20Router-black.svg)](https://nextjs.org/)
[![Fastify 5](https://img.shields.io/badge/API-Fastify%205-22c55e.svg)](https://fastify.dev/)
[![Medplum 5.1.42](https://img.shields.io/badge/FHIR%20R4-Medplum%205.1.42-3b82f6.svg)](https://medplum.com/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%20%2B%20Drizzle%20RLS-336791.svg)](https://orm.drizzle.team/)
[![Redis & BullMQ](https://img.shields.io/badge/Queue-Redis%20%2B%20BullMQ-d82c20.svg)](https://bullmq.io/)
[![TypeScript 7.0](https://img.shields.io/badge/TypeScript-7.0%20Strict%20%28No%20Any%29-3178c6.svg)](https://www.typescriptlang.org/)
[![Status: Core Spine Complete](https://img.shields.io/badge/Delivery-Core%20Spine%20Complete%20%28PR%20%2393%2C%20%2394%2C%20%23101%29-success.svg)](PROGRESS.md)

ASC EHR is a clinical-grade, high-throughput **Ambulatory Surgery Center (ASC) Operating System and Electronic Health Record (EHR)** purpose-built specifically for **single-specialty Gastrointestinal (GI) endoscopy facilities**.

Designed to govern the entire perioperative continuum from inbound fax referral to automated claims submission and surveillance recall, ASC EHR operates with **zero paper backup**. It reconciles high-velocity clinical turnover with strict regulatory enforcement, autonomous financial clearance, and native GI multiple endoscopy coding rules.

---

## Delivery Status & Implementation Roadmap

```mermaid
flowchart LR
    classDef done fill:#10b981,stroke:#059669,stroke-width:2px,color:#fff,rx:6px,ry:6px
    classDef active fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff,rx:6px,ry:6px
    classDef planned fill:#475569,stroke:#334155,stroke-width:2px,color:#94a3b8,rx:6px,ry:6px

    subgraph Roadmap ["ASC OS Delivery Status · Overall Progress: ~25% (~32 / 130 Stories Fully Wired End-to-End; ~45 UI Mocked)"]
        direction LR
        P1["<b>Phase 1: Intake & Scheduling</b><br/>EP-A · EP-B · EP-C<br/>✅ <b>Core Spine Complete</b>"]:::done
        P2["<b>Phase 2: Financial & Pre-Op</b><br/>EP-D · EP-E<br/>✅ <b>Core Spine Complete</b>"]:::done
        P3["<b>Phase 3: Day of Surgery</b><br/>EP-F · EP-G · EP-H · EP-I<br/>🔄 <b>ACTIVE / READY TO START</b>"]:::active
        P4["<b>Phase 4: Coding & Claims</b><br/>EP-J · EP-K<br/>⏳ <b>0% PLANNED</b>"]:::planned
        P5["<b>Phase 5: QAPI & Recall</b><br/>EP-L<br/>📋 <b>0% BACKLOG</b>"]:::planned

        P1 ==> P2 ==> P3 -.-> P4 -.-> P5
    end
```

```text
Total Delivery Progress: [█████░░░░░░░░░░░░░░░] ~25% End-to-End Wired (~32 / 130 Stories Fully Wired; ~45 UI Mocked)

Phase 1  [████████░░] Core Spine Complete │ Foundation, Intake & Scheduling (PR #75, #77, #78, #79, #84, #85, #87; remaining in P12, P24, P26)
Phase 2  [████████░░] Core Spine Complete │ Financial Clearance, Pre-Op & Hard Gate 1 (PR #89, #91, #93, #94, #101; remaining in P11, P12, P20)
Phase 3  [░░░░░░░░░░]   0%  ACTIVE        │ Day of Surgery, Documentation, Pathology & Scopes (P18, P20 Next)
Phase 4  [░░░░░░░░░░]   0%  PLANNED       │ Coding Engine, Multiple Endoscopy & Claims Cycle
Phase 5  [░░░░░░░░░░]   0%  BACKLOG       │ Quality, QAPI & Surveillance Recall Ladder
```

> 📖 **Detailed Sprint Tracking:** See [PROGRESS.md](PROGRESS.md) for granular task breakdowns, daily commits, and blocking lead-time items. See [docs/plan/implementation-plan.md](docs/plan/implementation-plan.md) for the master phase architecture.

---

## Master Architecture & Technology Stack

```mermaid
flowchart TD
    classDef clientLayer fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff,rx:8px,ry:8px
    classDef apiLayer fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff,rx:8px,ry:8px
    classDef workerLayer fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#fff,rx:8px,ry:8px
    classDef dataLayer fill:#6366f1,stroke:#4338ca,stroke-width:2px,color:#fff,rx:8px,ry:8px
    classDef packageLayer fill:#64748b,stroke:#334155,stroke-width:2px,color:#fff,rx:8px,ry:8px

    subgraph Client ["Client Presentation Layer"]
        Web["Next.js 16 App Router<br/>(React 19 Server/Client Components, @asc/ui)"]:::clientLayer
        Kiosk["Whiteboard TV Kiosk<br/>(HIPAA Redacted Initials + Case Number)"]:::clientLayer
    end

    subgraph Gateway ["API & Application Gateway"]
        API["Fastify 5 Security Spine<br/>(Gate 1: Tenant · Gate 2: Rate · Gate 3: IdP · Gate 4: Facility · Gate 5: Capability)"]:::apiLayer
    end

    subgraph AsyncWorker ["Background Execution Layer"]
        Worker["BullMQ + Redis Worker<br/>(PDF Generation, EDI Scrubbing, Batch Sweeps)"]:::workerLayer
        Bots["Medplum Headless Bots<br/>(Eligibility Polling, Conformance, Triggers)"]:::workerLayer
    end

    subgraph DataStore ["Durable Data Layer"]
        Medplum["Medplum 5.1.42 FHIR R4 Engine<br/>(Encounter, Appointment, ServiceRequest, Provenance)"]:::dataLayer
        Postgres["PostgreSQL + Drizzle ORM<br/>(Forced Row-Level Security & audit_events)"]:::dataLayer
        RedisStore["Redis 7<br/>(Job Queues, Rate Limiting, Pub/Sub)"]:::dataLayer
    end

    subgraph Packages ["Shared Monorepo Domain Packages"]
        Validation["@asc/validation<br/>(Strict Zod Contracts)"]:::packageLayer
        FHIRPkg["@asc/fhir<br/>(Isomorphic Builders & URLs)"]:::packageLayer
        RulesPkg["@asc/clinical-rules<br/>(Pure Gates, Scores & Time)"]:::packageLayer
        AuthzPkg["@asc/authz<br/>(RBAC & Capability Compiler)"]:::packageLayer
        UIPkg["@asc/ui<br/>(Tailwind v4 Clinical Components)"]:::packageLayer
        ClientPkg["@asc/api-client<br/>(Type-Safe React Query Hooks)"]:::packageLayer
        AgentPkg["@asc/agents<br/>(AI Guardrails & Human-in-the-Loop)"]:::packageLayer
        AuditPkg["@asc/audit<br/>(Tamper-Proof Durable Audit)"]:::packageLayer
    end

    Web -->|HTTP / SSE| API
    Kiosk -->|Live Polling / SSE| API
    API -->|Transaction Bundles| Medplum
    API -->|RLS withTenant| Postgres
    API -->|Enqueue Jobs| RedisStore
    RedisStore --> Worker
    Medplum --> Bots

    API -.-> Validation
    API -.-> RulesPkg
    API -.-> AuthzPkg
    API -.-> AuditPkg
    Web -.-> UIPkg
    Web -.-> ClientPkg
    Worker -.-> FHIRPkg
    Worker -.-> AgentPkg
```

### Technology Matrix

| Layer             | Component           | Stack & Version                                                                                                                                                                                     | Architectural Responsibility                                                               |
| ----------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Monorepo**      | Build & Workspaces  | [![Turborepo](https://img.shields.io/badge/Turborepo-2.11-ef4444.svg)](https://turbo.build/repo) [![pnpm](https://img.shields.io/badge/pnpm-10.26-orange.svg)](https://pnpm.io/)                    | Strict workspace boundaries, package caching, zero circular dependencies                   |
| **Frontend**      | Clinical Web App    | [![Next.js](https://img.shields.io/badge/Next.js-16.0-black.svg)](https://nextjs.org/) [![React](https://img.shields.io/badge/React-19.0-61dafb.svg)](https://react.dev/)                           | Next.js App Router, Server/Client Components, accessible clinical forms, Whiteboard Kiosk  |
| **UI Kit**        | Clinical Components | [![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8.svg)](https://tailwindcss.com/) [![shadcn](https://img.shields.io/badge/UI-shadcn%20%2B%20Base-black.svg)](https://ui.shadcn.com/) | Arm's-length touch targets ($\ge 44\text{ px}$), high-contrast clinical themes             |
| **API Server**    | Security Spine API  | [![Fastify](https://img.shields.io/badge/Fastify-5.0-22c55e.svg)](https://fastify.dev/)                                                                                                             | High-performance schema validation, default-deny 5-gate security spine, declarative routes, lifecycle preHandler hooks (`requireCaseContext`, `requireFacilityContext`, `requireCapabilityHook`, `requireIdempotency`, `validateBody`), domain controllers, centralized `API_ERROR_CODES` & `sendApiError`, upstream circuit resilience, and OpenAPI / Swagger UI at `/docs` |
| **Clinical Core** | FHIR Datastore      | [![Medplum](https://img.shields.io/badge/Medplum-5.1.42-3b82f6.svg)](https://medplum.com/)                                                                                                          | Self-hosted FHIR R4 engine, OAuth2/OIDC IdP, immutable audit & FHIR subscriptions          |
| **App Database**  | Multitenant DB      | [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org/) [![Drizzle](https://img.shields.io/badge/Drizzle-0.34-c5f015.svg)](https://orm.drizzle.team/)   | Multi-tenant isolation via PostgreSQL Row-Level Security (`withTenant`), append-only audit |
| **Job Queues**    | Background Workers  | [![BullMQ](https://img.shields.io/badge/BullMQ-5.53-d82c20.svg)](https://bullmq.io/) [![Redis](https://img.shields.io/badge/Redis-7.2-dc382d.svg)](https://redis.io/)                               | Asynchronous background pipelines (claims, PDF consent, notification sweeps)               |
| **Type Safety**   | Language Standard   | [![TypeScript](https://img.shields.io/badge/TypeScript-7.0%20Strict-3178c6.svg)](https://www.typescriptlang.org/)                                                                                   | Zero `any` or `unknown` types across all packages; strict compile-time checks              |

---

## Monorepo Layout

```text
ASC_EHR/
├── apps/
│   ├── api/                    # Fastify 5 REST API, security spine & case controllers
│   ├── web/                    # Next.js 16 clinical application, patient chart & whiteboard
│   ├── worker/                 # BullMQ background workers for async processing
│   └── bots/                   # Medplum Bots for FHIR automation and subscription handling
├── packages/
│   ├── clinical-rules/         # Pure clinical logic: Hard Gates 1/2/3, Scope Hang-Time, BBPS, Aldrete
│   ├── fhir/                   # Isomorphic FHIR R4 resource builders, CodeSystems & ValueSets
│   ├── validation/             # Canonical Zod schemas powering forms and API payload validation
│   ├── authz/                  # Capability catalog, role templates, access policy compiler
│   ├── ui/                     # Accessible Tailwind v4 clinical components (Whiteboard, Stepper, Banner)
│   ├── api-client/             # Type-safe API client and TanStack React Query hooks
│   ├── agents/                 # AI Agent Layer with strictly enforced commit boundaries
│   ├── db/                     # Drizzle ORM schema, migrations, RLS tenant isolation
│   ├── audit/                  # HIPAA durable append-only audit event logging
│   ├── logger/                 # Structured JSON logger with automatic PHI redaction
│   ├── telemetry/              # OpenTelemetry instrumentation and tracing
│   ├── types/                  # Shared TypeScript interfaces (strictly no schemas or runtime code)
│   └── config/                 # Centralized, Zod-validated environment configuration
├── docs/
│   ├── plan/                   # Master implementation plan, Gantt roadmaps & phase specs
│   ├── decisions/              # Architecture Decision Records (ADRs)
│   └── product/                # Clinical requirements and domain architecture specifications
├── infra/
│   ├── medplum/                # Local and cloud Medplum configuration, seed profiles & policies
│   └── terraform/              # Azure infrastructure as code (AKS, Postgres, Redis, KeyVault)
├── PROGRESS.md                 # Live single source of truth for engineering velocity & status
└── LEARNING_MISTAKES.md        # Monorepo mistakes log and permanent architectural guardrails
```

---

## Quickstart & Local Development

### Prerequisites

- **Node.js**: $\ge 20.18.0$
- **pnpm**: $\ge 10.26.2$ (`corepack enable`)
- **Docker**: Docker Engine $\ge 24$ and Docker Compose $\ge 2.20$

### 1. Environment Setup & Dependency Installation

```bash
# Clone the repository
git clone https://github.com/imRahul05/ASC-EHR.git
cd ASC_EHR

# Install all workspace dependencies
pnpm install
```

### 2. Start Supporting Infrastructure

Start local PostgreSQL and self-hosted Medplum FHIR server with seeded clinical practitioners:

```bash
# Start PostgreSQL (Database port 5432)
pnpm db:up

# Run Drizzle migrations
pnpm db:migrate

# Start Medplum FHIR R4 server + Admin App (Ports 8203 / 3003)
pnpm medplum:up

# Seed demo facility, roles, practitioners, and clinical catalogs
pnpm medplum:seed
```

### 3. Launch Development Environment

```bash
# Starts Next.js (Web: 3000), Fastify (API: 8000), and BullMQ Worker in parallel
pnpm dev
```

Navigate to:

- **Clinical App**: [http://localhost:3000](http://localhost:3000)
- **Whiteboard TV Kiosk**: [http://localhost:3000/board](http://localhost:3000/board)
- **Fastify API Health**: [http://localhost:8000/health](http://localhost:8000/health)
- **OpenAPI / Swagger UI Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Medplum Admin Console**: [http://localhost:3003](http://localhost:3003)

---

## Verification & Quality Gates

Every pull request must satisfy all 50+ Turborepo quality checks without exception:

```bash
# Run strict TypeScript typechecking across all packages (Zero any / unknown)
pnpm typecheck

# Run type-aware ESLint checks (App boundaries, PHI redaction, hook budgets)
pnpm lint

# Execute Vitest test suites across all packages and apps
pnpm test

# Verify production build compilation for all targets
pnpm build
```

---

## Key Documentation & Architecture References

- **[PROGRESS.md](PROGRESS.md)**: Live sprint board, completed phase logs, and active blockers.
- **[LEARNING_MISTAKES.md](LEARNING_MISTAKES.md)**: Catalog of historical defects and preventative architectural rules (LM-001 through LM-030).
- **[docs/plan/implementation-plan.md](docs/plan/implementation-plan.md)**: Master phase plan and global dependency matrix.
- **[docs/product/09-clinical-safety-and-stage-readiness.md](docs/product/09-clinical-safety-and-stage-readiness.md)**: Clinical safety architecture, 3 Hard Gates, Scope Hang-Time lock (168h), and decoupled Stage vs. Readiness model.
- **[docs/product/](docs/product/)**: Clinical requirements, domain architecture, and end-to-end perioperative workflows.
- **[docs/decisions/](docs/decisions/)**: Architecture Decision Records (ADRs) on identity, concurrency, and distributed locking.
- **[AGENTS.md](AGENTS.md)**: Strict autonomous agent contribution rules, session hygiene, and git branch protocols.
