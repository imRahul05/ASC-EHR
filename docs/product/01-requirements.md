# 01 — Requirements: GI ASC EHR

Merged from the Feature Spec (modules M01–M22) and the Roadmap feature map (140 rows). Rows that appear in only one source are marked **[spec-only]** or **[map-only]**. Phase tags are proposals for physician red-lining.

**Phase legend**
- **P1** — Go-live. Legally/operationally mandatory. Cannot see a patient without it.
- **P1.5** — Fast-follow *inside* the go-live window; P1 ships a compliant manual fallback.
- **P2** — First 90 days post go-live.
- **P3** — Quarters 2–3+.

Requirement IDs: `M<module>-<n>`. Each module lists **must**, then GI-specific **acceptance criteria (AC)** that are testable.

---

## 0. Scope boundaries (read first)

| In scope | Explicitly out of scope (all phases unless noted) |
|---|---|
| GI procedures at one ASC: colonoscopy, EGD, flex sig; ERCP/EUS only if confirmed in launch mix | ONC EHR certification (Provation-style positioning: procedure documentation + hand-off) |
| Anesthesia (AIMS) in-house, P1 | Claims adjudication, ERA posting, AR, patient statements, denial work (P3 optional) |
| CPT/ICD-10 coding + clean charge file **hand-off** to biller | e-Prescribing (ASC discharge meds via printed instructions; revisit if physicians require) |
| HIPAA-grade security, audit, BAA infrastructure | Office-based clinic EHR (eCW stays the clinic system; bridge is P3) |
| AI-native documentation with human confirmation | Autonomous AI signing, coding, or clinical decisions without clinician attestation |
| | Multi-specialty content (P3), multi-site UI (P3) — **but data model is multi-site-ready from day one** |

---

## PHASE 1 — Go-live

### M01 · Scheduling & Case Management — P1
| ID | Requirement | Source |
|---|---|---|
| M01-1 | Room/block scheduling grid: rooms × time, block templates per physician | spec + map (MindScript calendar reuse) |
| M01-2 | Assign proceduralist, anesthesia provider, RN, tech per case; surface conflicts (double-booked person/room/scope) | spec |
| M01-3 | Procedure templates: visit type → default duration, room type, required resources; data-driven, no hard-coding | map |
| M01-4 | Case **intent** captured at booking: *screening / surveillance / diagnostic* (drives coding later — see M09) | derived (GI) |
| M01-5 | Case status board (digital whiteboard): phase + location per patient in real time, TV-friendly view, PHI-minimized display (initials + MRN tail) | spec |
| M01-6 | Wait-list, reschedule, cancel, no-show tracking with reason codes | spec + map |
| M01-7 | Eligibility check triggered at booking; failures create a work item | spec + map |
| M01-8 | Escort/driver captured at booking (sedation requires it) | map |

**AC:** booking a case with an unavailable room, provider, or anesthesia provider is blocked with the conflicting item named; the whiteboard reflects a phase change on all screens in ≤ 2 s; cancelled/rescheduled blocks render muted (MindScript behavior).

### M02 · Patient Registration & Demographics — P1
| ID | Requirement | Source |
|---|---|---|
| M02-1 | Master patient record: name, DOB, MRN, sex, contact, guarantor, emergency contact | spec + map |
| M02-2 | Primary/secondary coverage, member IDs, auth numbers, card front/back image | spec + map |
| M02-3 | Duplicate detection at create (name + DOB + phone/insurance ID fuzzy match) and merge with audit | **spec-only** |
| M02-4 | Referring provider on file (NPI lookup) — mandatory field for GI referrals | spec |
| M02-5 | Day-of check-in: arrival time, same-day demographic/insurance re-verification | **map-only** |
| M02-6 | Document upload & linkage (ID, insurance, external records, referral letter) | **map-only** |

**AC:** creating a patient whose name+DOB matches an existing record forces a "same person?" decision; every case has a referring provider or an explicit "self-referred".

### M03 · Pre-procedure Intake, H&P, Risk — P1
| ID | Requirement | Source |
|---|---|---|
| M03-1 | Structured H&P; AI capture (dictate/converse → structured H&P) | spec |
| M03-2 | H&P currency rule: H&P within the regulatory window before procedure + day-of update attestation (CMS ASC CfC §416.52 — confirm window with compliance) | spec (GI detail derived) |
| M03-3 | Medication + allergy reconciliation (MindScript row pattern) | spec + map |
| M03-4 | **Medication hold-status flag**: detect anticoagulants/antiplatelets **and GLP-1 RAs, SGLT2 inhibitors, insulin/oral hypoglycemics, iron** on med list → protocol hold instruction → confirmation-of-hold captured pre-procedure | map (drug classes extended — GLP-1/SGLT2 are current aspiration/DKA risks for sedated endoscopy) |
| M03-5 | ASA physical status + airway (Mallampati) + anesthesia-specific history | spec + map |
| M03-6 | Risk screening: cardiac, airway, bleeding, OSA, pregnancy where applicable → documented clearance | spec |
| M03-7 | Bowel-prep: regimen assigned, instructions delivered, compliance confirmation, escalation if unconfirmed N days pre-procedure; NPO status day-of | spec + map (messaging automation → P2) |
| M03-8 | VTE/DVT risk assessment form | **map-only** — capture P1 *if* state-mandated; FL registry export P2 pending format confirmation |

**AC:** a case cannot move to *Ready for Procedure* if H&P is stale, ASA missing, or a flagged med has no hold confirmation or physician override.

### M04 · Nursing Documentation — P1
| ID | Requirement | Source |
|---|---|---|
| M04-1 | Pre-op assessment: vitals, IV access, checklist, NPO, escort re-confirmed | spec + map |
| M04-2 | Intra-procedure nursing / circulating note: time-stamped events, meds, specimens, positioning, equipment used | spec + map |
| M04-3 | Universal Protocol time-out: right patient/procedure/site, multi-role attestation, time-stamped + signed | spec + map |
| M04-4 | Counts & safety checks where applicable | spec + map |
| M04-5 | Post-op/PACU nursing record (see M08) | spec |

**AC:** procedure-start timestamp cannot be recorded before a completed time-out; each attestor is an authenticated user (no shared logins).

### M05 · Endoscopy Procedure Documentation (Report Writer) — P1 (core wedge)
| ID | Requirement | Source |
|---|---|---|
| M05-1 | Note generation for launch procedure mix (colonoscopy, EGD, flex sig; ERCP/EUS if confirmed) | spec |
| M05-2 | Indication capture, bound to diagnosis (MindScript dx-binding engine) | map |
| M05-3 | Findings by anatomic location as **structured data**: polyp size (mm), Paris morphology, location segment, removal technique, retrieval, biopsy, hemostasis, dilation, tattoo, complications | spec + map |
| M05-4 | Quality data at point of documentation: **BBPS** per segment, cecal intubation + landmark photo, insertion/cecum/withdrawal timestamps (withdrawal time computed, not typed), prep adequacy | spec (GI detail derived) |
| M05-5 | One pass generates: procedure note, patient discharge instructions, referring-physician letter | spec + map |
| M05-6 | Per-physician documentation preferences / defaults | spec |
| M05-7 | Record engine behaviors reused from MindScript: click-to-edit rows, in-note ⇄ panel sync, "edit as text" saves to structure, gap-chips, signed-record lock + audited unlock/addendum | map |
| M05-8 | AI output is a **draft**; physician confirms every structured finding before signature; provenance records AI vs human origin | derived (safety) |

**AC:** from a narrated colonoscopy with two polyps and one biopsy the system produces a draft with 2 polyp findings (size/location/morphology/technique), 1–3 specimens linked to those findings, BBPS, withdrawal time, CPT/ICD suggestions — physician edits only exceptions; signed note is immutable, edits become addenda.

### M06 · Intra-procedure Image & Media Capture — P1 / P1.5
| ID | Requirement | Phase |
|---|---|---|
| M06-1 | Capture/upload images (capture-card or tower export) and bind to patient, case, **and finding** | P1 |
| M06-2 | Annotate, label, select representative images for report; cecal landmark images flagged for quality | P1 |
| M06-3 | Direct tower integration (DICOM C-STORE or capture-station push) | P1.5 — hardware-dependent |

**AC:** an image cannot be attached to a case whose patient is not the one currently in that room; report PDF embeds selected images.

### M07 · Anesthesia / Sedation (AIMS) — P1 (highest liability)
| ID | Requirement | Phase |
|---|---|---|
| M07-1 | Pre-anesthesia evaluation (ASA carried from M03, airway, NPO, plan: MAC/propofol vs moderate sedation) | P1 |
| M07-2 | Intra-procedure record: **time-series vitals flowsheet** (HR, BP, SpO₂, EtCO₂, RR, sedation level) at required interval; medication administration log (drug, dose, route, time); events | P1 |
| M07-3 | Sedation depth scoring, airway interventions | P1 |
| M07-4 | Anesthesia start/stop time → anesthesia time for billing; flows to charge capture | P1 |
| M07-5 | Post-anesthesia note | P1 |
| M07-6 | Monitor/machine device capture (HL7 v2 ORU from monitor gateway) | P1.5 |
| M07-7 | Offline-tolerant entry: a network drop during a case must not lose data | P1 |

**AC:** manual interval entry works with no device; entries are timestamped at capture and at sync; late entries are marked as such; record is locked on anesthesia provider signature.

### M08 · Recovery (PACU) & Discharge — P1
| ID | Requirement | Source |
|---|---|---|
| M08-1 | Recovery vitals at intervals, complications | spec + map |
| M08-2 | Aldrete / PADSS auto-scored; discharge blocked below threshold without physician override | spec + map |
| M08-3 | Escort confirmed present before discharge | map |
| M08-4 | Patient discharge instructions (AI-generated, procedure-specific, plain language, languages TBD) | spec + map |
| M08-5 | Follow-up & recall: surveillance interval — **finalized after pathology** (see M10), provisional at discharge | spec (sequencing derived) |

### M09 · Coding + Charge Capture — Hand-off only — P1
| ID | Requirement | Source |
|---|---|---|
| M09-1 | CPT generation from structured findings (e.g. 45378/45380/45385/45384, 43235/43239/43251/43249; G0105/G0121 Medicare screening) | spec + map |
| M09-2 | **Screening→diagnostic conversion** detection: screening intent + therapeutic finding → Medicare **PT** / commercial **33** modifier; propagate to **anesthesia line** (e.g. 00812 → 00811-PT) | map (highest-stakes rule) |
| M09-3 | ICD-10 sequencing (finding primary, screening Z-code handling per payer rules) | map |
| M09-4 | Charge assembly: facility, professional, anesthesia (time units + modifiers) per case | spec + map |
| M09-5 | Clean charge/claim export in biller's format (837P/837I or CSV/SFTP — **format owed by business**) | spec |
| M09-6 | Code → evidence audit trail (each code links to the finding/document that justified it) | spec |
| M09-7 | Coder review queue before export (human attests) | derived |

**AC:** a screening colonoscopy for a Medicare patient with one snare polypectomy yields 45385-PT (+ ICD sequencing) and anesthesia line with PT; every exported line has an evidence link.

### M10 · Pathology / Specimen Tracking — P1
| ID | Requirement | Source |
|---|---|---|
| M10-1 | Specimen logged at capture: ID/label, container, site, **linked to the polyp/finding** | spec + map |
| M10-2 | Pathology requisition generated; routed to lab (P1: printed/PDF/fax requisition; P2+: electronic HL7/Health Gorilla) | spec |
| M10-3 | Outstanding-specimen tracking until result; alert on overdue | spec + map (Recovery Queue engine) |
| M10-4 | Result reconciliation: auto-resolve when result arrives, map histology (adenoma/SSL/hyperplastic/cancer) back to finding → **feeds ADR and surveillance interval** | spec + map |

**AC:** no case can be closed with a specimen lacking a result or a documented disposition; lost-specimen report exists.

### M11 · Consents & Compliance Forms — P1
Procedure consent, anesthesia consent, patient rights, HIPAA acknowledgment, financial responsibility, advance-directive status; e-signature (patient/guardian/witness); role-agnostic capture; stored with actor + timestamp + rendered PDF. **AC:** *Ready for Procedure* gate fails without both signed consents.

### M12 · Security, Roles, Audit — P1
| ID | Requirement |
|---|---|
| M12-1 | Roles: proceduralist, anesthesia (MD/CRNA), RN (pre/intra/PACU), tech, front desk, admin, coder/biller, read-only auditor |
| M12-2 | Permission scoping per role incl. field-level (e.g. front desk cannot see notes) |
| M12-3 | MFA, SSO, session timeout, break-glass access with reason + alert |
| M12-4 | Immutable audit of every PHI read/write + exportable audit reports |
| M12-5 | Encryption at rest/in transit; BAA-covered hosting and LLM endpoints only |
| M12-6 | Backup, point-in-time restore, tested restore; RPO ≤ 15 min, RTO ≤ 4 h (proposal) |
| M12-7 | **Sign Queue**: incomplete/unsigned charts per role with regulatory-deadline countdown (map; MindScript has it) |

### Recommended P1 additions (not in spec as P1)
| ID | Requirement | Why P1 |
|---|---|---|
| X1 | **Scope reprocessing log** — scope serial ⇄ case ⇄ HLD/AER cycle timestamp, traceability report | Map marks "non-negotiable"; outbreak traceability (esp. duodenoscopes) is asked by surveyors; cheap to build as data |
| X2 | **Adverse event / incident report** (basic form + worklist) | Accreditation (AAAHC/TJC) expects it from day one; it is one Questionnaire |
| X3 | **Referring-letter auto-send via fax** | Letter already generated in M05-5; MindScript fax pipeline exists; referral volume = revenue |

---

## PHASE 2 — First 90 days

| Module | Requirements |
|---|---|
| **M13 Quality & regulatory reporting** | GIQuIC colonoscopy + EGD form mapping and export; ADR & quality metrics per physician/facility; MIPS QCDR flag; ASCQR (HARP/Security Official tracking, HQR measures, claims-derived colonoscopy measures monitored not resubmitted); OAS CAHPS vendor interface; FL VTE registry export (if applicable) |
| **M14 Patient engagement** | Two-way SMS; prep reminder sequence; pre-op instructions; post-discharge check-in; digital pre-registration & intake; portal (results, docs, upload ID/insurance, self-schedule later); check-in kiosk |
| **M15 Inventory, supply, implant** | Stock, par levels, reorder alerts; lot/device tracking; cost-per-case |
| **M16 Preference cards & order sets** | Per-physician per-procedure setups pre-populating case; pre/intra/post order bundles |
| **M17 Referring loop (remaining)** | Portal/Direct delivery; inbound referral intake → scheduling; wait-list for earlier openings |
| **Money (map)** | Prior-auth tracker (UTN capture/propagation where applicable); patient estimate calculator |
| **Staff** | Staff scheduling; privileging/credential expiry tracking |
| **Compliance** | Infection surveillance log; NHSN OPC-SSI-ready capture (voluntary) |

## PHASE 3 — Q2–Q3+

Analytics (quality benchmarking incl. GIQuIC peer view, throughput/turnover/on-time starts, cost-per-case, payer mix) · optional RCM (claims submission/status/denials, ERA, AR) · interoperability (HL7/FHIR with hospitals/labs/HIEs, bidirectional lab, eCW bridge) · advanced AI (ambient across full case, real-time coding/compliance checks, guideline surveillance support) · multi-specialty & multi-site · payer intelligence.

---

## Non-functional requirements

| Area | Requirement |
|---|---|
| **Availability** | Operating hours ≈ 06:00–19:00 local are critical; 99.9 % during hours; maintenance outside hours |
| **Downtime procedure** | Printable downtime packet (day's schedule, per-patient face sheet, meds/allergies, blank flowsheets) generated nightly + on demand; back-entry workflow after recovery. *Accreditation expects a downtime plan.* |
| **Procedure-room UX** | Touch-first on tablet/cart; gloved-hand friendly large targets; voice capture; one-tap event timestamps (cecum reached, withdrawal start, scope out) |
| **Latency** | Whiteboard update ≤ 2 s; form save ≤ 500 ms p95; AI draft note ≤ 60 s after procedure end |
| **Offline tolerance** | Anesthesia flowsheet and nursing events queue locally and sync; no silent loss |
| **Volume sizing (to confirm)** | ~2–4 rooms × 15–30 cases/room/day; ~5 vitals/min × 30 min per sedated case — trivially within Postgres/FHIR scale |
| **Data retention** | Per state medical-record law + CMS; images retained with record; no hard delete of clinical data |
| **AI safety** | PHI only to BAA-covered model endpoints through `@repo/agents`; every AI output is a draft; Provenance + `agentExecutionId` on every AI-touched resource; eval suite per agent (note, coding) gated in CI |
| **Multi-site readiness** | Every resource tagged to an `Organization` (facility) from day one |
| **Accessibility** | WCAG 2.2 AA for staff and patient UIs |

---

## Conflicts found between the sources (to resolve)

| # | Conflict | Proposed resolution |
|---|---|---|
| C1 | Spec legend says go-live **December 2026**; Phase-1 heading says **Oct/Nov 2026** | Business to confirm; plan in [05](05-delivery-plan.md) assumes early December |
| C2 | Map lists a **Claims Engine** (submission, status, denials); spec defers full RCM to P3 | Keep P3. P1 = export only (M09-5) |
| C3 | Map-only rows (scope reprocessing, infection control, audit reports, VTE, prior auth, estimates, credentialing, document mgmt, roles UI) had no phase | Phased above; scope reprocessing + adverse event pulled into P1 |
| C4 | Spec-only rows (image capture, device-integrated AIMS, PACU, duplicate detection, MFA/backup, CAHPS, kiosk, preference cards, interop, eCW bridge) missing from map | Added to [appendix](appendix-feature-traceability.md) as supplemental rows |
| C5 | `docs/COMPLIANCE_AND_PHI.md` says "never include PHI in AI prompts" — incompatible with an AI scribe | Amend to: *PHI may go only to BAA-covered endpoints via the `@repo/agents` gateway, minimum necessary; never to non-BAA providers or logs.* Routing config must mark providers `baa: true/false` and refuse PHI tasks on non-BAA models |
| C6 | Existing ADR (AI SDK) already assumes Medplum FHIR CRUD, but no ADR adopts Medplum | New proposed ADR added |
