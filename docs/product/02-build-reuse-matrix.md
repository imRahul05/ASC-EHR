# 02 — Build / Reuse / Medplum Matrix

Three sources of already-done work, applied in this order before anyone writes new code:

1. **Medplum** (Apache-2.0, TypeScript, Postgres + Redis — same stack as this repo) → all *healthcare platform plumbing*.
2. **MindScript** (our existing product) → proven *clinical UX patterns and engines* (calendar, Record engine, queues, dx-binding, fax, note-gen).
3. **Build new** → only GI domain content/rules, the AI wedge, and ASC-specific workflows neither of the above has.

> **MindScript reuse caveat (updated 2026-09-27):** MindScript code is not in this repo. Its stack is now known from the [dev-team overview](../MindScript-How-It-Works.md): React + Vite + Tailwind + shadcn/ui + TanStack Query + Tiptap on the web, Express 5 + Clerk + Drizzle/Postgres + direct Anthropic calls on the server. UI and pure logic are **copy-and-adapt** (swap Radix→Base UI, Vite/Wouter→Next.js); backend plumbing is **not** ported. Some rows below were corrected after the overview — see [06 MindScript integration](06-mindscript-integration.md) for the full wiring map and the questions still open with the MindScript team.

Roadmap totals (140 rows): **40 MindScript yes · 9 partial · 91 new**. Of the 91 "new", roughly half are plumbing Medplum already ships (auth, roles, audit, documents, eligibility, messaging transport, HL7, tasks). The real net-new build is concentrated in the rows marked **Build** below.

---

## A. Module matrix

Size: **S** ≤ 1 dev-week · **M** 1–3 · **L** 3+ (rough, for sequencing only).

| Module | MindScript reuse | Medplum provides | We build (net-new) | Size |
|---|---|---|---|---|
| **M01 Scheduling** | Resource calendar grid (multi-column, overlap sub-columns, muted cancelled, filters, list⇄calendar, popover, scroll viewport); dynamic visit-type templates | `Schedule`, `Slot`, `Appointment`, `Location` (rooms), `Device` (scopes), `PractitionerRole`; search API; WebSocket Subscriptions for live updates | Block templates, conflict detection command, case intent, **case state machine**, whiteboard TV view, utilization rollups | M |
| **M02 Registration** | — | `Patient`, `RelatedPerson` (guarantor/escort), `Coverage`, `DocumentReference` + `Binary` (card images → Azure Blob); eligibility example (`medplum-eligibility-demo`) + Stedi / Candid X12 270/271 integration; NPPES NPI bot example | Duplicate-match rule + merge UX; day-of re-verification; registration UI | M |
| **M03 Intake / H&P** | Allergies + meds rows, structured-field pattern, AI capture pattern | `Questionnaire` / `QuestionnaireResponse`, `AllergyIntolerance`, `MedicationStatement`, `Observation`; `medplum-patient-intake-demo` (intake → resources extraction) | **Med-hold rules** (drug class → hold protocol), H&P currency gate, ASA/airway forms, prep tracker, VTE form | M |
| **M04 Nursing** | Vitals row, signed-record pattern | `Questionnaire`, `Observation`, `Procedure`, `Provenance` (signatures) | Time-out multi-attestation, counts, circulating note content, **one Questionnaire renderer** in `@asc/ui` (reused by M03/M04/M08/M11/X2) | M |
| **M05 Procedure note** | **Record engine** (section editors on typed `structuredData`, click-to-edit rows, in-note⇄panel sync, edit-as-text→structure, gap-chips, sign lock/unlock), Assessment/Plan dx-binding, **draft-first note pipeline** (verification, critic + targeted regeneration), `gastroenterology` constitution, must-not-miss checks, Guideline Advisor | `Procedure`, `Observation`, `Specimen`, `Media`, `Composition`/`DiagnosticReport`, `Provenance`; terminology (`CodeSystem`/`ValueSet` + `$expand`); PDF via Bot | **GI content model** (polyp/finding schema, Paris, BBPS, segments, MST terms), **AI note agent** (narration → FHIR draft bundle), event timestamps UI, preferences | **L** |
| **M06 Images** | — | `Media`/`DocumentReference` + `Binary`; **Medplum Agent DICOM C-STORE** listener on-prem → Bot | Capture/upload UI bound to active case + finding; annotation/selection; tower adapter (P1.5) | M |
| **M07 AIMS** | Vitals row only (no time-series in MindScript) | `Observation` time series, `MedicationAdministration`, `Procedure`; **Medplum Agent HL7 v2 MLLP** for monitor ORU (P1.5) | **Flowsheet grid** (time-series, fast entry, offline queue), sedation scoring, anesthesia time, drug library | **L** |
| **M08 PACU/Discharge** | Vitals row, note-gen pattern | `Questionnaire`, `Observation`, `CarePlan`, `Communication` | Aldrete/PADSS scoring (`@asc/clinical-rules`), discharge gate, instructions agent, recall entry | S–M |
| **M09 Coding + charge** | dx→ICD binding, ICD-10/CPT + **CCI** checks, pre-sign validation, coding eval cases; *screening→diagnostic detection and facility fee capture not in overview — confirm*; E&M logic does not apply | `ChargeItem`, `Claim`, `Coverage`, `Provenance`; Stedi 837 / Candid integration if biller accepts; CMS-1500 PDF bot example | **GI coding rules engine** (CPT selection, PT/33, anesthesia propagation, ICD sequencing), coding agent (suggest + explain), coder queue, export adapter in biller's format | **L** |
| **M10 Specimens** | Worklist *pattern* only — MindScript's Recovery queue is cancelled-appointment follow-up, not a result-gap engine (see 06 F3) | `Specimen`, `ServiceRequest`, `DiagnosticReport`, `Task`; Health Gorilla / Labcorp / Quest / HL7 ORM-ORU via Agent; eFax | Specimen⇄finding link, requisition PDF, histology→finding reconciliation, overdue rules | M |
| **M11 Consents** | Consent-by-default architecture, role-agnostic capture, actor+timestamp | `Consent`, `DocumentReference`, `Questionnaire`; DocuSign / Dropbox Sign bot patterns | Signature pad component, consent templates, gate check | S |
| **M12 Security & audit** | Sign + lock, pre-sign validation, PHI log redaction, breach detection rules; *Sign Queue not in overview — confirm* | **OAuth2/OIDC, MFA, SMART, external IdP (Entra SSO), `AccessPolicy` (resource + field + compartment level), `ProjectMembership`, `AuditEvent` on every FHIR access, Medplum App for user/role admin** | Role definitions as AccessPolicies (config), break-glass flow, audit report export, Sign Queue deadlines | S–M |
| **X1 Scope reprocessing** | — | `Device` (scope), `Procedure` (reprocess cycle), search/reporting | Log UI + traceability report | S |
| **X2 Adverse events** | — | `Questionnaire`, `AdverseEvent`, `Task` | Form + worklist | S |
| **M13 Quality (P2)** | GIQuIC mapping ("Yes, strong" — auto-populates from note) | Bulk export / search; Bots for scheduled export | GIQuIC file/API adapter, ADR calc, ASCQR tracking | M |
| **M14 Patient engagement (P2)** | Patient notification pattern; possible shared Vapi voice/SMS infra (not in overview — confirm) | `Communication`, Twilio SMS bots, `foomedical` patient-portal reference app, patient-intake demo | Prep reminder sequences, portal UI in our design system, kiosk | M–L |
| **M15–M17 (P2)** | **faxagnet** fax engine as a called service (inbound confirmed; outbound confirm); chart-review "facts with sources" for referral packets | `SupplyDelivery`, `Device`, `PlanDefinition`/`ActivityDefinition` (order sets), eFax bot | Inventory UI, preference cards, inbound referral intake | M |
| **M18–M22 (P3)** | Planned Practice Analytics Dashboard; **eCW client via Integuru** (schedule, chart docs, progress notes, note write-back) + hash-diff schedule sync — eCW bridge becomes a port, read slice can move earlier | Snowflake/Bulk FHIR export, SMART-on-FHIR, CDS Hooks, FHIRcast, Epic FHIR, Health Gorilla HIE, `medplum-mso-demo` (multi-org) | Analytics, RCM (if chosen), eCW bridge adaptation to Medplum, specialty content | L |

---

## B. What we explicitly do NOT build (and what replaces it)

| Tempting to build | Use instead | Why |
|---|---|---|
| Our own Postgres clinical schema + migrations | Medplum FHIR store (Postgres) + FHIR profiles in `@asc/fhir` | Search, versioning (`_history`), validation, referential model already done; interop in P3 is free |
| Auth, MFA, SSO, sessions | Medplum Auth (+ Entra SSO as external IdP) | Security-critical, accreditation-audited; zero value in rewriting |
| RBAC engine | Medplum `AccessPolicy` (with field-level + compartment rules) | Enforced at data layer — every path (web, API, bots) is covered |
| PHI access audit table | Medplum `AuditEvent` (automatic) + `@asc/audit` for business/agent events | Covers HIPAA access audit without instrumenting every read |
| Realtime/WebSocket infra for whiteboard | Medplum Subscriptions (WebSocket) | Built-in, criteria-based |
| Workflow/queue engine for worklists | FHIR `Task` + Bots (+ BullMQ for heavy AI jobs) | Sign Queue, Recovery Queue, prep escalation, specimen overdue = one engine |
| HL7 v2 parser, MLLP server, DICOM listener | Medplum Agent (on-prem) + `@medplum/hl7` | Hardest integration plumbing, already packaged as Windows service |
| File storage service | Medplum `Binary` → Azure Blob (`azure:<account>:<container>`) | Access-controlled, audited |
| Admin console (users, roles, forms, bots, code systems) | Medplum App | P1 admin needs are back-office; no custom UI |
| X12 270/271, 837 plumbing | Stedi/Candid via Medplum integration patterns — only if biller wants 837 | P1 hand-off may be a CSV/SFTP; confirm first |
| Fax / SMS transport | faxagnet (Wybit fax engine, called via API proxy) or Medplum eFax bot; Twilio bot | Transport is commodity |
| Full RCM, eRx, ONC certification | Out of scope (see 01 §0) | Scope decision already made |
| Custom time-series DB for vitals | FHIR `Observation` | ~150 obs per sedated case ≈ a few thousand/day — trivial |
| Mantine-based clinical UI (`@medplum/react`) | Headless `@medplum/react-hooks` + `@asc/ui` | Repo rule: shadcn/Base UI only in `apps/web`; avoids two design systems |

---

## C. Medplum primitive → where we use it

| Medplum primitive | Used for |
|---|---|
| FHIR R4 REST + GraphQL + search | All clinical reads/writes; whiteboard queries; worklists |
| `AccessPolicy` / `ProjectMembership` | Role model (M12), facility compartments (multi-site readiness) |
| `AuditEvent` | PHI access audit; exported by audit report (M12-4) |
| Subscriptions (WebSocket + rest-hook) | Whiteboard live updates; trigger worker jobs on signed notes |
| Bots | Questionnaire extraction, Task auto-create/resolve, HL7/DICOM inbound handling, PDF render, fax/SMS send, eligibility call, scheduled exports |
| Agent (on-prem) | Monitor HL7 ORU (P1.5), lab HL7 (P2+), DICOM from tower/capture station (P1.5) |
| `Binary` + Azure Blob | Images, signed consent PDFs, card scans, generated reports |
| Terminology (`CodeSystem`, `ValueSet`, `$expand`, `$validate-code`) | ICD-10-CM, SNOMED subsets, GI terms (MST), local codes; **CPT loaded under our AMA license** (not bundled) |
| Profiles (`StructureDefinition`, `$validate`) | GI procedure, finding, specimen, anesthesia record profiles (FSH authored — `medplum-fsh-profiles` example) |
| Medplum App | Admin console (users, access policies, questionnaires, bots, code systems) |
| Examples to fork from | `medplum-provider` (clinician app patterns), `medplum-task-demo` (worklists), `medplum-patient-intake-demo`, `medplum-eligibility-demo`, `medplum-efax-demo`, `medplum-health-gorilla-demo`, `medplum-websocket-subscriptions-demo`, `medplum-fsh-profiles`, `medplum-mso-demo`, `foomedical` |

## D. Known Medplum gaps / costs (be honest)

| Gap | Mitigation |
|---|---|
| CPT codes not bundled (AMA license) | License CPT; load as `CodeSystem` via CLI; ICD-10-CM is public |
| No GI-specific content, no AIMS UI, no ASC scheduling UX | That is our build — the wedge |
| Self-hosting on Azure is "validated for production" but operationally heavy (AKS, Postgres Flexible, Redis, App Gateway, CDN via Terraform) | Budget platform time in week 1–2. Self-host is decided (D1 in 05); no hosted fallback |
| Bots run in Medplum's runtime — cannot import our workspace packages directly | Bundle bots with esbuild from `apps/bots`; keep bots thin; heavy logic → worker via Subscription |
| Duplicate-patient matching not a turnkey MPI | Simple deterministic rules in API + `Patient.link` merge |
| Version drift (fast-moving project) | Pin server + `@medplum/*` versions; upgrade on a cadence in staging |
