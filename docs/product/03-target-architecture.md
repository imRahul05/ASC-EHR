# 03 — Target Architecture

Principle: **Medplum is the system of record; our code owns GI domain logic, the AI wedge, and the UX.** No clinical data lives outside FHIR except transient job payloads.

## 1. System context

```mermaid
flowchart TB
    classDef person fill:#1e3a8a,color:#fff,stroke:#1e3a8a
    classDef ours fill:#2563eb,color:#fff,stroke:#1d4ed8
    classDef ext fill:#64748b,color:#fff,stroke:#475569
    classDef dev fill:#a16207,color:#fff,stroke:#713f12

    subgraph People
        Doc["Gastroenterologist"]:::person
        Anes["Anesthesia MD / CRNA"]:::person
        RN["Pre-op / Procedure / PACU RN, Tech"]:::person
        Front["Front desk, Scheduler"]:::person
        Coder["Coder / Admin"]:::person
        Pt["Patient"]:::person
    end

    EHR["GI ASC EHR<br/>(our platform + Medplum)"]:::ours

    subgraph ASC_Floor ["ASC floor devices"]
        Tower["Endoscopy tower / capture card"]:::dev
        Monitor["Patient monitors / anesthesia machine"]:::dev
        AER["Scope reprocessor (AER)"]:::dev
    end

    subgraph External
        LLM["LLM endpoints under BAA<br/>(Anthropic / Azure OpenAI)"]:::ext
        Clear["Clearinghouse / eligibility<br/>(Stedi or Candid)"]:::ext
        Biller["ASC billing company<br/>(charge file hand-off)"]:::ext
        Lab["Pathology lab"]:::ext
        Ref["Referring physicians<br/>(fax / Direct / eCW)"]:::ext
        Reg["GIQuIC, CMS HQR, CAHPS vendor"]:::ext
        SMS["SMS / voice (Twilio / Vapi)"]:::ext
    end

    Doc & Anes & RN & Front & Coder --> EHR
    Pt -->|P2 portal, SMS| EHR
    Tower -->|images: upload P1, DICOM P1.5| EHR
    Monitor -->|HL7 v2 ORU P1.5| EHR
    AER -.->|manual log P1| EHR
    EHR --> LLM
    EHR <--> Clear
    EHR -->|837 / CSV / SFTP| Biller
    EHR <-->|requisition / results| Lab
    EHR -->|letters| Ref
    EHR -->|P2 exports| Reg
    EHR <--> SMS
```

## 2. Containers

```mermaid
flowchart LR
    classDef web fill:#3b82f6,color:#fff,stroke:#2563eb
    classDef api fill:#10b981,color:#fff,stroke:#059669
    classDef worker fill:#f59e0b,color:#fff,stroke:#d97706
    classDef mp fill:#7c3aed,color:#fff,stroke:#5b21b6
    classDef store fill:#334155,color:#fff,stroke:#0f172a
    classDef ext fill:#94a3b8,color:#fff,stroke:#475569

    subgraph Clients
        Web["apps/web · Next.js<br/>clinical workstation, room tablet,<br/>whiteboard TV"]:::web
        Portal["apps/portal · P2<br/>patient portal + kiosk"]:::web
        MPApp["Medplum App<br/>admin console only"]:::mp
    end

    subgraph Our_Services ["Our services (Azure)"]
        API["apps/api · Fastify<br/>GI command layer, AI endpoints (SSE),<br/>coding rules, exports"]:::api
        Worker["apps/worker · BullMQ<br/>AI jobs, PDF, fax, exports,<br/>scheduled reports"]:::worker
        Redis[("Redis<br/>(queues)")]:::store
    end

    subgraph Medplum_Platform ["Medplum (self-hosted, Azure)"]
        MPS["Medplum server<br/>FHIR R4 · Auth · AccessPolicy ·<br/>AuditEvent · Subscriptions · Bots"]:::mp
        PG[("Postgres Flexible<br/>FHIR store")]:::store
        MRedis[("Redis<br/>(Medplum)")]:::store
        Blob[("Azure Blob<br/>Binary: images, PDFs")]:::store
    end

    subgraph On_Prem ["ASC on-prem"]
        Agent["Medplum Agent<br/>HL7 v2 MLLP · DICOM C-STORE"]:::mp
        Cap["Capture station"]:::ext
        Mon["Monitor gateway"]:::ext
    end

    LLM["LLM (BAA)"]:::ext
    Ext["Clearinghouse · Lab · Fax · SMS · Biller SFTP"]:::ext

    Web -->|"reads, simple writes<br/>(user token)"| MPS
    Web -->|"WebSocket subscriptions"| MPS
    Web -->|"commands, AI (user token)"| API
    Portal --> MPS
    Portal --> API
    MPApp --> MPS
    API -->|"on-behalf-of user"| MPS
    API --> Redis --> Worker
    Worker -->|"system client, scoped"| MPS
    Worker --> LLM
    API --> LLM
    MPS -->|"rest-hook subscription"| API
    MPS --- PG & MRedis & Blob
    MPS -->|Bots| Ext
    Worker --> Ext
    Cap -->|DICOM| Agent
    Mon -->|HL7 ORU| Agent
    Agent -->|"outbound websocket"| MPS
```

### Request-path rule (keeps us from writing proxy code)

| Kind of operation | Path | Why |
|---|---|---|
| Read / search / simple create-update with no GI rules (e.g. edit demographics, add allergy) | `web → Medplum` directly with user's token | AccessPolicy + AuditEvent apply automatically; zero API code |
| **Command** with domain rules or multi-resource transaction (book case, advance case phase, sign note, time-out attest, compute codes, export charges) | `web → Fastify command → Medplum (user token, FHIR transaction Bundle)` | Rules live in one tested place (`@asc/clinical-rules`); atomic writes |
| AI generation (H&P, note, instructions, letter, coding suggestions) | `web → Fastify (SSE)`; long jobs → BullMQ worker | Streaming UX; model routing via `@asc/agents` |
| Event reaction, small (extract QuestionnaireResponse, create/resolve Task, ACK HL7) | Medplum **Bot** on Subscription | Runs next to data; no infra |
| Event reaction, heavy (LLM, PDF batches, exports) | Subscription rest-hook → API → BullMQ → worker | Our packages, retries, observability |

## 3. FHIR data model (core of a case)

```mermaid
flowchart LR
    classDef who fill:#1e3a8a,color:#fff,stroke:#1e3a8a
    classDef case fill:#2563eb,color:#fff,stroke:#1d4ed8
    classDef clin fill:#0f766e,color:#fff,stroke:#115e59
    classDef money fill:#b45309,color:#fff,stroke:#78350f
    classDef wf fill:#7c3aed,color:#fff,stroke:#5b21b6

    Patient["Patient"]:::who
    Coverage["Coverage"]:::who
    RP["RelatedPerson<br/>escort, guarantor"]:::who
    Appt["Appointment<br/>room, time, participants"]:::case
    Enc["Encounter = THE CASE<br/>status + case-phase extension<br/>+ location history"]:::case
    SR["ServiceRequest<br/>planned procedure<br/>intent: screening / surveillance / diagnostic"]:::case
    QR["QuestionnaireResponse<br/>H&P, nursing, time-out,<br/>Aldrete, VTE, consent forms"]:::clin
    Obs["Observation<br/>vitals series, ASA, BBPS,<br/>withdrawal time"]:::clin
    MA["MedicationAdministration<br/>sedation / anesthesia drugs"]:::clin
    Proc["Procedure<br/>colonoscopy / EGD"]:::clin
    Find["Observation: finding<br/>polyp size, Paris, segment"]:::clin
    Spec["Specimen<br/>label, container, site"]:::clin
    DR["DiagnosticReport<br/>pathology histology"]:::clin
    Media["Media<br/>endoscopy image"]:::clin
    Dev["Device<br/>scope serial"]:::clin
    Reproc["Procedure<br/>reprocessing cycle"]:::clin
    Comp["Composition<br/>signed procedure note"]:::clin
    Cons["Consent"]:::clin
    Charge["ChargeItem<br/>CPT, modifiers, units"]:::money
    Claim["Claim / export bundle"]:::money
    Task["Task<br/>sign, specimen, prep,<br/>coder worklists"]:::wf
    Prov["Provenance<br/>signer + agentExecutionId"]:::wf

    Patient --> Coverage
    Patient --> RP
    Appt --> Enc
    Patient --> Enc
    Enc --> SR
    Enc --> QR
    Enc --> Obs
    Enc --> MA
    Enc --> Proc
    Enc --> Cons
    Proc -->|usedReference| Dev
    Dev --> Reproc
    Proc -->|finding| Find
    Find -->|polyp to specimen| Spec
    Spec -->|histology, drives ADR| DR
    DR -.->|reconciles| Find
    Find --> Media
    Comp --> Proc
    Comp --> Prov
    Enc --> Charge
    Charge -->|evidence| Find
    Charge --> Claim
    Task -->|focus| Enc
```

Key modeling choices:
- **Encounter = the case.** Phase (`scheduled → … → closed`) as a coded extension; `Encounter.location` history gives room/bay for the whiteboard and turnover analytics for free.
- **Finding ⇄ specimen ⇄ pathology link is first-class.** ADR, surveillance interval, GIQuIC export, and coding evidence all depend on it.
- **Intent on `ServiceRequest`** (screening/surveillance/diagnostic) set at booking — the coding engine reads it; nobody retypes it.
- **Signed = `Composition.status=final` + `Provenance` signature.** Changes after sign = new version + addendum `Provenance`; Medplum `_history` keeps every version.
- **Every resource carries `meta.account` / facility `Organization`** → AccessPolicy compartments make multi-site a config change later.
- Profiles authored in FSH in `packages/fhir/profiles`, compiled to `StructureDefinition`s, uploaded to Medplum; types generated for TS.

## 4. Monorepo layout (additions)

```mermaid
flowchart TD
    classDef newpkg fill:#16a34a,color:#fff,stroke:#15803d
    classDef exist fill:#64748b,color:#fff,stroke:#475569

    Web["apps/web"]:::exist
    API["apps/api"]:::exist
    Worker["apps/worker"]:::exist
    Bots["apps/bots (NEW)<br/>Medplum bot sources, esbuild bundle,<br/>deployed via medplum CLI"]:::newpkg
    Infra["infra/ (NEW)<br/>Terraform: Medplum on Azure + our apps"]:::newpkg

    FHIR["@asc/fhir (NEW)<br/>FSH profiles, CodeSystems/ValueSets,<br/>Questionnaires-as-code, typed builders,<br/>re-export @medplum/fhirtypes"]:::newpkg
    Rules["@asc/clinical-rules (NEW)<br/>pure fns: case gates, med-hold,<br/>Aldrete/PADSS, BBPS, withdrawal time,<br/>CPT/modifier engine, ICD sequencing"]:::newpkg
    MPC["@asc/api-client<br/>+ Medplum client factory"]:::exist
    Agents["@asc/agents<br/>+ note, H&P, coding, letter agents;<br/>baa flag in provider catalog"]:::exist
    Val["@asc/validation<br/>Zod for AI output → FHIR draft"]:::exist
    UI["@asc/ui<br/>+ calendar, Record engine, flowsheet,<br/>Questionnaire renderer, signature pad"]:::exist
    Audit["@asc/audit · logger · telemetry"]:::exist

    Web --> UI & MPC & FHIR & Rules & Val
    API --> FHIR & Rules & Agents & Val & Audit & MPC
    Worker --> FHIR & Agents & Audit & MPC
    Bots --> FHIR & Rules
```

`@asc/clinical-rules` is shared by web (instant UI feedback), API (authoritative enforcement) and bots — exactly the anti-duplication rule in `docs/agent/architecture.md`. It must be pure and exhaustively unit-tested; coding rules get golden-case fixtures reviewed by a certified coder.

## 5. AI layer

```mermaid
flowchart LR
    classDef ai fill:#ef4444,color:#fff,stroke:#b91c1c
    classDef safe fill:#0f766e,color:#fff,stroke:#115e59
    In["Narration audio / text<br/>+ structured context (FHIR)"] --> Min["Minimum-necessary<br/>context builder"]:::safe
    Min --> GW["@asc/agents gateway<br/>task → tier → BAA-only models"]:::ai
    GW --> Out["Structured output<br/>(Zod schema)"]
    Out --> Val["@asc/validation +<br/>@asc/clinical-rules checks"]:::safe
    Val --> Draft["FHIR draft Bundle<br/>status=preliminary"]
    Draft --> Human["Clinician confirm / edit"]:::safe
    Human --> Sign["Sign → final + Provenance<br/>(user + agentExecutionId)"]
    GW -.-> AuditL["@asc/audit event<br/>(no PHI payload)"]
```

Model configuration (tiers, tasks, logical models, routing profiles, hosting targets for vendor API / Azure / AWS) is documented with diagrams in [`packages/agents/README.md`](../../packages/agents/README.md).

Agents (task types to add to routing config): `hp_intake`, `procedure_note`, `discharge_instructions`, `referral_letter`, `coding_suggest`, `pathology_reconcile`, `surveillance_interval` (P3). Rules:
- **Deterministic first, LLM second** for coding: the rules engine decides CPT/modifiers where rules are clear; the LLM proposes only where judgement is needed and must cite evidence resource IDs.
- Every agent has an offline eval set (de-identified/synthetic) run in CI; regression blocks release (fits the staging fixture strategy in the environments ADR).
- Speech-to-text vendor must also be under BAA.

## 6. Security & compliance mapping

| Control | Implementation |
|---|---|
| Identity, MFA, SSO | Medplum Auth; Entra ID as external IdP for staff |
| Authorization | One `AccessPolicy` per role; field-level hiding (e.g. front desk ↛ `Composition`); facility compartment |
| Break-glass | Elevated policy for 1 h, mandatory reason, `@asc/audit` alert |
| PHI access audit | Medplum `AuditEvent` (automatic) |
| Business / AI audit | `@asc/audit` (actor, action, resource ids, `agentExecutionId`, no PHI) |
| Logs / traces | `@asc/logger`, `@asc/telemetry` with redaction (existing) |
| Encryption | Azure-managed keys at rest (Postgres, Blob, Redis); TLS 1.2+; Agent uses outbound TLS websocket — no inbound firewall holes at ASC |
| Backups | Postgres PITR; Blob soft-delete + versioning; quarterly restore test |
| BAAs | Azure, LLM provider(s), STT vendor, SMS/fax vendor, clearinghouse |

## 7. Deployment

```mermaid
flowchart TB
    classDef az fill:#0078d4,color:#fff,stroke:#005a9e
    classDef onp fill:#a16207,color:#fff,stroke:#713f12

    subgraph Azure ["Azure (BAA) — one subscription per env: dev / staging / prod"]
        AGW["App Gateway + WAF"]:::az
        subgraph AKS ["AKS"]
            MPpod["medplum-server pods"]:::az
            APIpod["api pods"]:::az
            Wpod["worker pods"]:::az
        end
        CDN["Static web: Next.js + Medplum App"]:::az
        PGf[("Postgres Flexible<br/>zone-redundant, PITR")]:::az
        R1[("Azure Cache for Redis")]:::az
        BL[("Blob Storage")]:::az
        KV["Key Vault"]:::az
        Mon["Azure Monitor / OTel collector"]:::az
    end

    subgraph ASC ["ASC network"]
        WS["Workstations, tablets, whiteboard TV"]:::onp
        AG["Medplum Agent (Windows service)"]:::onp
        CS["Capture station"]:::onp
        MG["Monitor gateway"]:::onp
        PR["Label printer (specimens, wristbands)"]:::onp
    end

    WS -->|HTTPS| AGW
    AGW --> MPpod & APIpod
    CDN --- AGW
    MPpod --> PGf & R1 & BL
    APIpod --> R1
    Wpod --> R1
    MPpod & APIpod & Wpod --> KV
    MPpod & APIpod & Wpod --> Mon
    CS -->|DICOM| AG
    MG -->|HL7 MLLP| AG
    AG -->|outbound WSS| AGW
    WS --> PR
```

Medplum's documented Azure path (Terraform: VNet, AKS, Postgres Flexible, Redis, Storage, CDN, App Gateway) is the base; our api/worker deploy to the same AKS. Staging holds synthetic data only (per environments ADR).
