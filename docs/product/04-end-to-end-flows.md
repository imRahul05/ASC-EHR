# 04 — End-to-End Flows

Legend used in labels: **[MS]** = MindScript reuse · **[MP]** = Medplum primitive · **[NEW]** = we build.

## 4.1 Whole patient journey (referral → quality report)

```mermaid
flowchart TD
    classDef p1 fill:#2563eb,color:#fff,stroke:#1d4ed8
    classDef p2 fill:#16a34a,color:#fff,stroke:#15803d
    classDef gate fill:#dc2626,color:#fff,stroke:#991b1b
    classDef ai fill:#9333ea,color:#fff,stroke:#6b21a8

    A["Referral arrives<br/>fax / phone / eCW<br/>(P1 manual entry, P2 intake queue)"]:::p1
    B["Register patient<br/>dup check, coverage, card scan,<br/>referring NPI"]:::p1
    C["Book case<br/>room + block + team,<br/>intent: screening / surveillance / diagnostic"]:::p1
    D["Eligibility 270/271<br/>failure -> Task"]:::p1
    E["Pre-procedure<br/>H&P, meds + hold flags, ASA,<br/>prep instructions, escort"]:::ai
    F["Prep reminders + confirmation<br/>(P1 phone, P2 SMS)"]:::p2
    G["Day-of check-in<br/>re-verify, arrival"]:::p1
    H["Pre-op nursing<br/>vitals, IV, NPO, consents signed"]:::p1
    GATE1{"Ready-for-procedure gate<br/>H&P current, ASA, consents,<br/>holds confirmed, escort"}:::gate
    I["Procedure room<br/>time-out -> anesthesia record,<br/>narration, images, specimens,<br/>event timestamps"]:::ai
    J["AI draft: note + findings +<br/>codes + instructions + letter"]:::ai
    K["PACU<br/>vitals, Aldrete/PADSS"]:::p1
    GATE2{"Discharge gate<br/>score threshold, escort present"}:::gate
    L["Discharge<br/>instructions, provisional recall"]:::p1
    M["Physician signs note<br/>(Sign Queue)"]:::p1
    N["Coder review -> charge export<br/>to biller"]:::p1
    O["Referring letter auto-fax"]:::p1
    P["Pathology result arrives<br/>-> reconcile to polyp"]:::p1
    Q["Final surveillance interval<br/>+ result letter to patient & referrer"]:::p1
    R["GIQuIC / ASCQR / ADR<br/>(P2)"]:::p2

    A --> B --> C --> D --> E --> F --> G --> H --> GATE1
    GATE1 -->|pass| I
    GATE1 -->|fail| H
    I --> J
    I --> K --> GATE2
    GATE2 -->|pass| L
    GATE2 -->|fail| K
    J --> M --> N
    M --> O
    I -->|specimens| P --> Q
    P --> R
    M --> R
```

## 4.2 Case state machine (Encounter case-phase)

Transitions are **commands** in `apps/api`; gates are pure functions in `@repo/clinical-rules` (also run in the UI for instant feedback). Every transition writes `Encounter` + `Provenance` in one FHIR transaction; the whiteboard updates via Subscription.

```mermaid
stateDiagram-v2
    [*] --> Scheduled
    Scheduled --> Confirmed: eligibility ok, prep confirmed
    Scheduled --> Cancelled
    Confirmed --> Cancelled
    Confirmed --> NoShow
    Confirmed --> Arrived: check-in
    Arrived --> PreOp: RN starts assessment
    PreOp --> ReadyForProcedure: GATE H&P, ASA, consents, holds, escort
    ReadyForProcedure --> InProcedure: time-out attested
    InProcedure --> Recovery: scope out, anesthesia end
    Recovery --> ReadyForDischarge: GATE Aldrete/PADSS, escort present
    ReadyForDischarge --> Discharged
    Discharged --> ChartComplete: all notes signed
    ChartComplete --> Coded: coder attests
    Coded --> Exported: charge file sent
    Exported --> Closed: all specimens resulted, recall set
    Cancelled --> [*]
    NoShow --> [*]
    Closed --> [*]
```

## 4.3 Scheduling & eligibility

```mermaid
sequenceDiagram
    autonumber
    actor FD as Front desk
    participant W as apps/web calendar [MS]
    participant A as apps/api book-case [NEW]
    participant R as clinical-rules [NEW]
    participant M as Medplum FHIR [MP]
    participant B as Eligibility Bot [MP]
    participant C as Clearinghouse

    FD->>W: drag case to room/time, pick template + intent
    W->>R: local conflict check (instant feedback)
    W->>A: POST /cases (patient, template, room, team, intent)
    A->>M: search Appointment/Slot overlaps (room, staff, scope)
    A->>R: validate conflicts, durations, escort captured
    A->>M: transaction: Appointment + Encounter(Scheduled) + ServiceRequest(intent)
    M-->>W: Subscription event (calendar + whiteboard refresh)
    M->>B: Subscription on new Appointment
    B->>C: X12 270
    C-->>B: 271
    B->>M: CoverageEligibilityResponse
    alt inactive / not covered
        B->>M: Task(eligibility-failed, owner=front desk)
    end
```

## 4.4 Pre-procedure intake, H&P & med-hold

```mermaid
sequenceDiagram
    autonumber
    actor RN as Pre-admission RN / MD
    participant W as web Record engine [MS]
    participant A as api /ai/hp (SSE)
    participant G as agents gateway (BAA)
    participant R as clinical-rules med-hold [NEW]
    participant M as Medplum
    participant BOT as Extraction Bot [MP]

    RN->>W: open case, dictate / converse
    W->>A: stream audio/text + case id
    A->>M: read meds, allergies, prior H&P (user token)
    A->>G: hp_intake task (minimum necessary context)
    G-->>A: structured H&P (Zod-validated)
    A-->>W: stream draft rows (gap-chips for missing)
    W->>R: evaluate meds: anticoag / antiplatelet / GLP-1 / SGLT2 / insulin / iron
    R-->>W: hold protocol + days, needs confirmation
    RN->>W: confirm rows, record hold confirmation, ASA, airway
    W->>M: QuestionnaireResponse (H&P) + MedicationStatement updates
    M->>BOT: Subscription
    BOT->>M: Observations (ASA, airway), Task if hold unconfirmed near date
```

## 4.5 Procedure room: AI-native documentation

```mermaid
sequenceDiagram
    autonumber
    actor MD as Gastroenterologist
    actor RN as Procedure RN
    participant T as Room tablet (web)
    participant A as apps/api
    participant Q as worker (BullMQ)
    participant G as agents gateway (BAA LLM + STT)
    participant R as clinical-rules
    participant M as Medplum

    RN->>T: time-out (multi-role attestation)
    T->>A: POST /cases/:id/time-out -> InProcedure
    MD->>T: narration starts (mic)
    RN->>T: one-tap events: cecum reached, withdrawal start, scope out
    RN->>T: log specimen jar per polyp (label prints)
    T->>M: Observation(events), Specimen(draft), Media(uploads)
    MD->>T: end procedure
    T->>A: POST /cases/:id/generate-note
    A->>Q: job procedure_note
    Q->>G: transcript + structured events + images metadata
    G-->>Q: findings[], interventions[], impression, BBPS, recs
    Q->>R: validate (sizes, segments, specimen links), compute withdrawal time
    Q->>R: coding engine -> CPT/ICD/modifiers with evidence ids
    Q->>M: draft Bundle: Procedure, finding Observations, Composition(preliminary), ChargeItem(draft), Provenance(agentExecutionId)
    M-->>T: Subscription -> draft appears in Record engine
    MD->>T: review exceptions only, edit rows (in-note and panel sync)
    MD->>T: sign
    T->>A: POST /notes/:id/sign
    A->>M: Composition final + Provenance(signature) + Task(sign) completed
    A->>Q: jobs: discharge_instructions, referral_letter, PDF render
```

## 4.6 Image capture (P1 upload → P1.5 tower)

```mermaid
flowchart LR
    classDef p1 fill:#2563eb,color:#fff,stroke:#1d4ed8
    classDef p15 fill:#a16207,color:#fff,stroke:#713f12
    classDef mp fill:#7c3aed,color:#fff,stroke:#5b21b6

    Tower["Endoscopy tower<br/>video out / capture button"]
    Card["Capture card on<br/>room workstation"]:::p1
    Web["web: capture panel<br/>bound to ACTIVE case in this room"]:::p1
    Bin["Medplum Binary<br/>Azure Blob"]:::mp
    Media["Media resource<br/>-> case, -> finding"]:::mp
    DICOM["Tower / capture station<br/>DICOM C-STORE"]:::p15
    Agent["Medplum Agent"]:::mp
    Bot["Image Bot: match worklist<br/>room + time -> case"]:::mp
    Sel["Physician selects + annotates<br/>cecal landmarks flagged"]:::p1
    PDF["Report PDF embeds selected"]:::p1

    Tower --> Card --> Web --> Bin --> Media
    Tower -.-> DICOM -.-> Agent -.-> Bot -.-> Media
    Media --> Sel --> PDF
```

Safety rule: an image is accepted only for the case currently `InProcedure` in that room; mismatch → quarantine Task.

## 4.7 Anesthesia record (AIMS)

```mermaid
sequenceDiagram
    autonumber
    actor AN as Anesthesia provider
    participant F as web flowsheet [NEW]
    participant L as local queue (IndexedDB)
    participant A as apps/api
    participant M as Medplum
    participant AG as Medplum Agent (P1.5)
    participant MON as Monitor gateway (P1.5)

    AN->>F: pre-anesthesia eval (ASA carried forward, airway, plan MAC)
    AN->>F: anesthesia start
    loop every interval (e.g. 5 min) or event
        AN->>F: vitals / drug dose / sedation level
        F->>L: persist immediately (offline-safe)
        L->>M: Observation / MedicationAdministration (retry until ack)
    end
    opt device integration P1.5
        MON->>AG: HL7 v2 ORU^R01 (MLLP)
        AG->>M: Bot -> Observations tagged device-sourced
        M-->>F: Subscription -> flowsheet auto-fills, provider validates
    end
    AN->>F: anesthesia end, post-anesthesia note, sign
    F->>A: POST /anesthesia/:id/sign
    A->>M: lock record, anesthesia time -> ChargeItem (units + modifiers)
```

## 4.8 Specimen → pathology → ADR → surveillance (closed loop)

```mermaid
sequenceDiagram
    autonumber
    participant M as Medplum
    participant BOT as Recovery-Queue Bot [MS engine on MP Task]
    participant L as Pathology lab
    participant W as worker
    participant R as clinical-rules
    actor MD as Gastroenterologist

    M->>BOT: Specimen created (linked to polyp Observation)
    BOT->>M: ServiceRequest(pathology) + Task(specimen-outstanding, due date)
    Note over M,L: P1 requisition PDF / fax, P2+ HL7 ORM or Health Gorilla
    L-->>M: result (HL7 ORU via Agent, or scanned PDF + manual entry)
    M->>BOT: DiagnosticReport created
    BOT->>M: link report to Specimen + polyp, Task resolved
    BOT->>W: enqueue pathology_reconcile
    W->>R: histology to adenoma/SSL/hyperplastic/cancer + surveillance interval rule
    W->>M: draft result letter + recall (CarePlan / ServiceRequest future)
    M-->>MD: Task(review-pathology)
    MD->>M: approve -> letters sent (fax referrer, patient SMS/portal/mail)
    Note over BOT: overdue Task escalates daily, no case closes with open specimen
```

## 4.9 Coding & charge hand-off

```mermaid
flowchart TD
    classDef rule fill:#0f766e,color:#fff,stroke:#115e59
    classDef ai fill:#9333ea,color:#fff,stroke:#6b21a8
    classDef hum fill:#1e3a8a,color:#fff,stroke:#1e3a8a
    classDef out fill:#b45309,color:#fff,stroke:#78350f

    In["Signed note + findings +<br/>anesthesia time + intent + coverage"]
    R1["Rule: CPT per procedure/intervention<br/>e.g. 45378 / 45380 / 45385 / 43239"]:::rule
    R2["Rule: screening -> diagnostic?<br/>Medicare: PT, commercial: 33,<br/>G-codes when no intervention"]:::rule
    R3["Rule: anesthesia line<br/>00811 / 00812 / 00813 / 00731,<br/>propagate PT, units from time"]:::rule
    R4["Rule: ICD-10 sequencing<br/>finding primary, Z-codes per payer"]:::rule
    AI["Coding agent: fills ambiguous cases,<br/>cites evidence resource ids"]:::ai
    CI["ChargeItems draft<br/>(facility, professional, anesthesia)"]
    H["Coder queue (Task)<br/>attest / edit"]:::hum
    X["Export adapter<br/>837P / 837I / CSV per biller"]:::out
    S["SFTP / clearinghouse"]:::out
    AUD["Evidence trail:<br/>ChargeItem -> Observation / Procedure"]

    In --> R1 --> R2 --> R3 --> R4 --> CI
    In --> AI --> CI
    CI --> H --> X --> S
    CI --> AUD
```

## 4.10 Security & audit on every request

```mermaid
sequenceDiagram
    autonumber
    actor U as Staff user
    participant IdP as Entra ID (SSO)
    participant MA as Medplum Auth
    participant W as web
    participant A as api
    participant M as Medplum FHIR
    participant AU as @repo/audit

    U->>W: open app
    W->>MA: OIDC login
    MA->>IdP: federated sign-in + MFA
    IdP-->>MA: identity
    MA-->>W: access token (ProjectMembership -> AccessPolicy for role)
    W->>M: FHIR read (token)
    M->>M: AccessPolicy filter + AuditEvent (automatic)
    W->>A: command (token)
    A->>M: FHIR transaction on-behalf-of user (policy still enforced)
    A->>AU: business event (actor, action, ids, agentExecutionId, no PHI)
```

## 4.11 Referring loop & patient communications

```mermaid
flowchart LR
    classDef p1 fill:#2563eb,color:#fff,stroke:#1d4ed8
    classDef p2 fill:#16a34a,color:#fff,stroke:#15803d
    Sign["Note signed"] --> Letter["referral_letter agent<br/>draft, MD approves"]:::p1
    Letter --> PDF["PDF Bot"]:::p1 --> Fax["Fax pipeline [MS] / eFax bot [MP]"]:::p1 --> Ref["Referring MD"]
    Path["Path resulted"] --> Letter2["Result letter"]:::p1 --> Fax
    Disc["Discharge"] --> Instr["Instructions print / SMS link"]:::p1
    Sched["Case booked"] --> Rem["Prep reminder sequence<br/>T-7, T-3, T-1 + confirm"]:::p2 --> SMS["Twilio / Vapi"]:::p2
    Disc --> Chk["Post-discharge check-in T+1"]:::p2 --> SMS
    Inb["Inbound referral fax"] --> Intake["Referral intake queue (Task)"]:::p2 --> Sched
```

## 4.12 Quality reporting (P2)

```mermaid
flowchart LR
    classDef mp fill:#7c3aed,color:#fff,stroke:#5b21b6
    classDef nb fill:#f59e0b,color:#fff,stroke:#b45309
    Data["Structured data captured in P1<br/>findings, BBPS, cecal photo,<br/>withdrawal time, path histology"]
    Calc["ADR / cecal intubation /<br/>withdrawal / prep metrics<br/>per MD + facility"]:::nb
    GQ["GIQuIC mapper<br/>colonoscopy + EGD forms [MS mapping]"]:::nb
    AS["ASCQR tracker<br/>HQR measures, HARP, OAS CAHPS"]:::nb
    Sch["Scheduled Bot / worker job"]:::mp
    Data --> Calc --> Dash["Dashboards (P3)"]
    Data --> Sch --> GQ --> GIQ["GIQuIC registry"]
    Sch --> AS --> CMS["CMS HQR / survey vendor"]
```

The P2 registry work is cheap **only if** P1 captures findings as structured data with the finding⇄specimen⇄histology link. That is why M05-3/M05-4 and M10-4 are P1 acceptance criteria, not nice-to-haves.
