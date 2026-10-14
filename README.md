# ASC EHR — Gastrointestinal Ambulatory Surgery Center Operating System

[![Monorepo: Turborepo](https://img.shields.io/badge/Monorepo-Turborepo-ef4444.svg)](https://turbo.build/repo)
[![Next.js 16](https://img.shields.io/badge/Web-Next.js%2016%20App%20Router-black.svg)](https://nextjs.org/)
[![Fastify 5](https://img.shields.io/badge/API-Fastify%205-22c55e.svg)](https://fastify.dev/)
[![Medplum 5.1.42](https://img.shields.io/badge/FHIR%20R4-Medplum%205.1.42-3b82f6.svg)](https://medplum.com/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%20%2B%20Drizzle%20RLS-336791.svg)](https://orm.drizzle.team/)
[![Redis & BullMQ](https://img.shields.io/badge/Queue-Redis%20%2B%20BullMQ-d82c20.svg)](https://bullmq.io/)
[![TypeScript 7.0](<https://img.shields.io/badge/TypeScript-7.0%20Strict%20(No%20Any)-3178c6.svg>)](https://www.typescriptlang.org/)
[![Status: Phase 1 Complete](<https://img.shields.io/badge/Delivery-Phase%201%20Complete%20(PR%20%2379)-success.svg>)](PROGRESS.md)

ASC EHR is a clinical-grade, high-throughput **Ambulatory Surgery Center (ASC) Operating System and Electronic Health Record (EHR)** purpose-built specifically for **single-specialty Gastrointestinal (GI) endoscopy facilities**.

Designed to govern the entire perioperative continuum from inbound fax referral to automated claims submission and surveillance recall, ASC EHR operates with **zero paper backup**. It reconciles high-velocity clinical turnover with strict regulatory enforcement, autonomous financial clearance, and native GI multiple endoscopy coding rules.

---

## Delivery Status & Implementation Roadmap

```mermaid
flowchart LR
    classDef done fill:#10b981,stroke:#059669,stroke-width:2px,color:#fff,rx:6px,ry:6px
    classDef active fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff,rx:6px,ry:6px
    classDef planned fill:#475569,stroke:#334155,stroke-width:2px,color:#94a3b8,rx:6px,ry:6px

    subgraph Roadmap ["ASC OS Delivery Status · Overall Progress: ~28% (34 / 130 Stories)"]
        direction LR
        P1["<b>Phase 1: Intake & Scheduling</b><br/>EP-A · EP-B · EP-C<br/>✅ <b>100% COMPLETE</b>"]:::done
        P2["<b>Phase 2: Financial & Pre-Op</b><br/>EP-D · EP-E<br/>🔄 <b>25% ACTIVE</b>"]:::active
        P3["<b>Phase 3: Day of Surgery</b><br/>EP-F · EP-G · EP-H · EP-I<br/>⏳ <b>0% PLANNED</b>"]:::planned
        P4["<b>Phase 4: Coding & Claims</b><br/>EP-J · EP-K<br/>⏳ <b>0% PLANNED</b>"]:::planned
        P5["<b>Phase 5: QAPI & Recall</b><br/>EP-L<br/>📋 <b>0% BACKLOG</b>"]:::planned

        P1 ==> P2 -.-> P3 -.-> P4 -.-> P5
    end
```

```text
Total Delivery Progress: [██████░░░░░░░░░░░░░░] 28% Complete

Phase 1  [██████████] 100%  COMPLETE  │ Foundation, Intake & Scheduling (PR #79 merged)
Phase 2  [███░░░░░░░]  25%  ACTIVE    │ Financial Clearance & Pre-Op Readiness (P15c, P17, P16, P22a)
Phase 3  [░░░░░░░░░░]   0%  PLANNED   │ Day of Surgery, Documentation, Pathology & Scopes
Phase 4  [░░░░░░░░░░]   0%  PLANNED   │ Coding Engine, Multiple Endoscopy & Claims Cycle
Phase 5  [░░░░░░░░░░]   0%  BACKLOG   │ Quality, QAPI & Surveillance Recall Ladder
```

> 📖 **Detailed Sprint Tracking:** See [PROGRESS.md](PROGRESS.md) for granular task breakdowns, daily commits, and blocking lead-time items. See [docs/plan/implementation-plan.md](docs/plan/implementation-plan.md) for the master phase architecture.

---

## Core Clinical Safety: The 3 Strict Hard Gates

Patient safety in ASC EHR is governed by three non-negotiable **Clinical Hard Gates** and a **Sterile Scope Hang-Time Lock**. Physical case state progression is blocked until mandatory safety criteria are met:

```mermaid
flowchart LR
    classDef gateNode fill:#dc2626,stroke:#991b1b,stroke-width:2px,color:#fff,rx:6px,ry:6px
    classDef stageNode fill:#1e293b,stroke:#475569,stroke-width:2px,color:#fff,rx:6px,ry:6px
    classDef lockNode fill:#7c3aed,stroke:#5b21b6,stroke-width:2px,color:#fff,rx:6px,ry:6px

    Arrived["arrived<br/>(Front Desk)"]:::stageNode
    G1{"HARD GATE 1<br/>Clinical Clearance"}:::gateNode
    PreOp["preop<br/>(Pre-Op Bay)"]:::stageNode
    G2{"HARD GATE 2<br/>Room Safety & Timeout"}:::gateNode
    InRoom["in_room<br/>(Procedure Room)"]:::stageNode
    ScopeLock{"SCOPE HANG-TIME<br/>≤ 168 Hours"}:::lockNode
    Procedure["procedure_start<br/>(Scope In)"]:::stageNode
    PACU["pacu<br/>(Recovery Bay)"]:::stageNode
    G3{"HARD GATE 3<br/>Discharge Readiness"}:::gateNode
    Discharged["discharged<br/>(Left Center)"]:::stageNode

    Arrived --> G1 --> PreOp
    PreOp --> G2 --> InRoom
    InRoom --> ScopeLock --> Procedure
    Procedure --> PACU --> G3 --> Discharged
```

- **Gate 1 (`arrived` ➔ `preop`)**: Evaluated by [`evaluateGate1`](packages/clinical-rules/src/gates/gate1.ts). Requires positive 2-factor identity, signed tablet consent, valid H&P (< 30 days + update note), NPO, and adult escort. **Identity and consent are strictly non-waivable by any role.**
- **Gate 2 (`preop` ➔ `in_room`)**: Evaluated by [`evaluateGate2`](packages/clinical-rules/src/gates/gate2.ts). Requires pre-anesthesia clearance (ASA class + Mallampati score), anticoagulation hold verification, equipment readiness, and synchronous multi-role timeout attestation (MD, CRNA, RN).
- **Gate 3 (`pacu` ➔ `discharged`)**: Requires Aldrete recovery score $\ge 9$, stable interval vitals, bedside physical escort verification, signed procedure note, and printed discharge instructions.
- **Scope Hang-Time Lock**: Evaluated by [`evaluateScopeHangTime`](packages/clinical-rules/src/gates/scope-hang-time.ts). Enforces **168 hours (7 days) maximum** elapsed from sterile reprocessing. Zero overrides permitted.

---

## Architectural Core: Stage vs. Readiness Decoupling

ASC EHR decouples physical patient **Stage** (where the patient physically is, 12 sequential states) from computed **Readiness** (pure functional reduction over 12 clinical & administrative checks):

```mermaid
flowchart TD
    subgraph PhysicalStage ["Physical Patient Stage (12 States · Strictly Forward)"]
        direction LR
        S1[requested] --> S2[scheduled] --> S3[confirmed] --> S4[arrived] --> S5[preop] --> S6[in_room]
        S6 --> S7[procedure_start] --> S8[procedure_end] --> S9[pacu] --> S10[discharged]
        S2 -.-> S11[cancelled]
        S3 -.-> S12[no_show]
    end

    subgraph ComputedReadiness ["12 Independent Computed Readiness Checks"]
        direction TB
        C1["identity (Non-waivable)"]
        C2["coverage (270/271 Active)"]
        C3["benefits (Deductible/OOP)"]
        C4["authorization (278 On-File)"]
        C5["estimate (Good-Faith Delivered)"]
        C6["consent (Signed · Non-waivable)"]
        C7["hp (H&P <30d + Update Note)"]
        C8["anticoagulation (Hold Verified)"]
        C9["anesthesia_clearance (ASA Assessed)"]
        C10["prep (Adequacy / Effluent)"]
        C11["escort (Confirmed Adult)"]
        C12["equipment (Scope Ready & ≤168h)"]
    end

    ComputedReadiness -->|Pure Functional Evaluation| OverallReadiness{"Overall Readiness<br/>ready · blocked · pending"}
    OverallReadiness -->|Evaluated at| Gate1["Gate 1 (Arrived ➔ Pre-Op)"]
    OverallReadiness -->|Evaluated at| Gate2["Gate 2 (Pre-Op ➔ In-Room)"]
```

- **Zero Combinatorial Explosion**: Eliminates 140+ synthetic statuses; physical stage moves forward while readiness evaluates dynamically.
- **Non-Blocking Financial Flow**: Pending insurance authorizations route asynchronous `Task` items to billing staff without blocking arrived patients from clinical pre-op preparation.

> 📖 **Full Specification:** See [docs/product/09-clinical-safety-and-stage-readiness.md](docs/product/09-clinical-safety-and-stage-readiness.md) for the complete hard gates rules, waiver hierarchy, and FHIR R4 extension mappings.

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
| **API Server**    | Security Spine API  | [![Fastify](https://img.shields.io/badge/Fastify-5.0-22c55e.svg)](https://fastify.dev/)                                                                                                             | High-performance schema validation, default-deny 5-gate security spine                     |
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
- **[docs/decisions/](docs/decisions/)**: Architecture Decision Records (ADRs) on identity, concurrency, and distributed locking.
- **[AGENTS.md](AGENTS.md)**: Strict autonomous agent contribution rules, session hygiene, and git branch protocols.
