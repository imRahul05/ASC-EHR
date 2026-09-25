# Appendix — Feature Traceability

Generated from `Roadmap GI ASC Feature-map.xlsx` (sheet *Feature Detail*, 140 rows) plus 32 spec-only rows. Added columns: requirement ID (see [01](01-requirements.md)), proposed phase, Medplum primitive, build type.

**Build type:** `Configure [MP]` = Medplum feature + configuration · `Port [MS]` = bring MindScript component/engine · `Port + extend [MS]` = MindScript pattern with new fields/logic · `Build [NEW]` = net-new code (usually *on top of* the listed Medplum primitive).

| Build type | All roadmap rows | Of which Phase 1 |
|---|---|---|
| Configure [MP] | 12 | 10 |
| Port [MS] | 39 | 36 |
| Port + extend [MS] | 7 | 6 |
| Build [NEW] | 82 | 48 |

## Roadmap rows

| Section | Module | Feature | MindScript (source) | Req | Phase | Medplum primitive | Build type | Notes |
|---|---|---|---|---|---|---|---|---|
| Foundation | Resource Scheduling Calendar | Multi-provider + multi-resource column grid | Yes -- exact pattern already built | M01 | P1 | Appointment, Schedule/Slot, Location; Subscriptions | Port [MS] |  |
| Foundation | Resource Scheduling Calendar | Color-by-type with legend | Yes | M01 | P1 | Appointment, Schedule/Slot, Location; Subscriptions | Port [MS] |  |
| Foundation | Resource Scheduling Calendar | Time-positioned, duration-sized blocks | Yes | M01 | P1 | Appointment, Schedule/Slot, Location; Subscriptions | Port [MS] | Took real iteration to get right the first time |
| Foundation | Resource Scheduling Calendar | Overlap handling -- side-by-side sub-columns | Yes | M01 | P1 | Appointment, Schedule/Slot, Location; Subscriptions | Port [MS] |  |
| Foundation | Resource Scheduling Calendar | Muted rendering for rescheduled/cancelled | Yes | M01 | P1 | Appointment, Schedule/Slot, Location; Subscriptions | Port [MS] |  |
| Foundation | Resource Scheduling Calendar | Column show/hide filtering | Yes | M01 | P1 | Appointment, Schedule/Slot, Location; Subscriptions | Port [MS] |  |
| Foundation | Resource Scheduling Calendar | List ⇄ calendar view toggle | Yes | M01 | P1 | Appointment, Schedule/Slot, Location; Subscriptions | Port [MS] |  |
| Foundation | Resource Scheduling Calendar | Click-block popover (Prepare/Start actions) | Yes | M01 | P1 | Appointment, Schedule/Slot, Location; Subscriptions | Port [MS] |  |
| Foundation | Resource Scheduling Calendar | Bounded, scrollable viewport | Yes | M01 | P1 | Appointment, Schedule/Slot, Location; Subscriptions | Port [MS] | Also took several rounds in MindScript |
| Foundation | Procedure Templates | Template definitions per visit type | Partial | M01 | P1 | ActivityDefinition / PlanDefinition (or config) | Port + extend [MS] |  |
| Foundation | Procedure Templates | Default duration/resource requirements | New | M01 | P1 | ActivityDefinition / PlanDefinition (or config) | Build [NEW] |  |
| Foundation | Procedure Templates | Dynamic template list, no hardcoding | Yes -- same rule as visit-type classification | M01 | P1 | ActivityDefinition / PlanDefinition (or config) | Port [MS] |  |
| Foundation | Utilization Dashboard | OR/room utilization % by day/week | New | M18 | P3 | Search over Appointment / Encounter.location | Build [NEW] |  |
| Foundation | Utilization Dashboard | Block-time fill-rate tracking | New | M18 | P3 | Search over Appointment / Encounter.location | Build [NEW] |  |
| Foundation | Utilization Dashboard | No-show/cancellation rate rollup | Extends Recovery Queue data | M18 | P3 | Search over Appointment / Encounter.location | Port + extend [MS] |  |
| Foundation | Patient Registration + Eligibility Check | Demographics intake | New | M02 | P1 | Patient, Coverage, DocumentReference+Binary; eligibility bot | Build [NEW] |  |
| Foundation | Patient Registration + Eligibility Check | Real-time payer eligibility verification | New | M02 | P1 | Patient, Coverage, DocumentReference+Binary; eligibility bot | Configure [MP] | Clearinghouse-connected |
| Foundation | Patient Registration + Eligibility Check | Insurance card capture/storage | New | M02 | P1 | Patient, Coverage, DocumentReference+Binary; eligibility bot | Configure [MP] |  |
| Foundation | The Record (core documentation engine) | Structured, click-to-edit rows per section | Yes | M05 | P1 | Composition, Provenance, _history | Port [MS] |  |
| Foundation | The Record (core documentation engine) | Diagnosis-bound order/coding logic | Yes | M05 | P1 | Composition, Provenance, _history | Port [MS] |  |
| Foundation | The Record (core documentation engine) | Signed-record lock + audited Unlock | Yes | M05 | P1 | Composition, Provenance, _history | Configure [MP] |  |
| Foundation | The Record (core documentation engine) | Gap-chips instead of absence-sentences | Yes | M05 | P1 | Composition, Provenance, _history | Port [MS] |  |
| Foundation | The Record (core documentation engine) | In-note AND panel editing, kept in sync | Yes | M05 | P1 | Composition, Provenance, _history | Port [MS] | This alone took multiple rounds in MindScript |
| Foundation | The Record (core documentation engine) | "Edit as text" fallback that saves to structure | Yes | M05 | P1 | Composition, Provenance, _history | Port [MS] |  |
| Case Record | Bowel Prep Tracker | Patient instruction delivery | Partial | M03 | P1 | Communication, Task, Observation | Port + extend [MS] |  |
| Case Record | Bowel Prep Tracker | Compliance confirmation capture | New | M03 | P1 | Communication, Task, Observation | Build [NEW] |  |
| Case Record | Bowel Prep Tracker | Escalation if unconfirmed near procedure date | New | M03 | P1 | Communication, Task, Observation | Build [NEW] |  |
| Case Record | Pre-Op Nursing Assessment | NPO status field | New | M04 | P1 | Questionnaire, Observation, AllergyIntolerance, MedicationStatement | Build [NEW] |  |
| Case Record | Pre-Op Nursing Assessment | Allergy reconciliation | Yes -- reuse | M04 | P1 | Questionnaire, Observation, AllergyIntolerance, MedicationStatement | Port [MS] |  |
| Case Record | Pre-Op Nursing Assessment | Current meds reconciliation | Yes -- reuse | M04 | P1 | Questionnaire, Observation, AllergyIntolerance, MedicationStatement | Port [MS] |  |
| Case Record | Pre-Op Nursing Assessment | Vitals capture | Yes -- reuse | M04 | P1 | Questionnaire, Observation, AllergyIntolerance, MedicationStatement | Port [MS] |  |
| Case Record | Medication Hold-Status Flag | Anticoagulant/antiplatelet detection on med list | New | M03 | P1 | MedicationStatement, Task | Build [NEW] |  |
| Case Record | Medication Hold-Status Flag | Hold-instruction protocol per drug class | New | M03 | P1 | MedicationStatement, Task | Build [NEW] |  |
| Case Record | Medication Hold-Status Flag | Confirmation-of-hold capture pre-procedure | New | M03 | P1 | MedicationStatement, Task | Build [NEW] |  |
| Case Record | VTE/DVT Risk Assessment + Registry Export | Structured risk-assessment form | New | M03 | P1 capture / P2 export | Questionnaire, RiskAssessment | Build [NEW] |  |
| Case Record | VTE/DVT Risk Assessment + Registry Export | Risk-stratification logic | New | M03 | P1 capture / P2 export | Questionnaire, RiskAssessment | Build [NEW] |  |
| Case Record | VTE/DVT Risk Assessment + Registry Export | FL state registry submission/export | New | M03 | P1 capture / P2 export | Questionnaire, RiskAssessment | Build [NEW] | Confirm submission format/API first |
| Case Record | Anesthesia Pre-Evaluation | ASA classification capture | New | M07 | P1 | Questionnaire, Observation | Build [NEW] |  |
| Case Record | Anesthesia Pre-Evaluation | Airway assessment | New | M07 | P1 | Questionnaire, Observation | Build [NEW] |  |
| Case Record | Anesthesia Pre-Evaluation | Anesthesia-specific history intake | Partial | M07 | P1 | Questionnaire, Observation | Port + extend [MS] |  |
| Case Record | Consent Capture | Procedure consent | Yes | M11 | P1 | Consent, DocumentReference | Port [MS] |  |
| Case Record | Consent Capture | Anesthesia consent | Yes | M11 | P1 | Consent, DocumentReference | Port [MS] |  |
| Case Record | Consent Capture | Role-agnostic capture ("whoever opens the chart") | Yes | M11 | P1 | Consent, DocumentReference | Port [MS] |  |
| Case Record | Consent Capture | Stored with actor + timestamp | Yes | M11 | P1 | Consent, DocumentReference | Port [MS] |  |
| Case Record | Discharge Readiness Checklist | Escort/driver confirmation at scheduling | New | M08 | P1 | Questionnaire, RelatedPerson | Build [NEW] |  |
| Case Record | Discharge Readiness Checklist | Re-confirmed day-of | New | M08 | P1 | Questionnaire, RelatedPerson | Build [NEW] |  |
| Case Record | Day-of Check-In | Arrival confirmation | New | M02 | P1 | Encounter, Coverage | Build [NEW] |  |
| Case Record | Day-of Check-In | Same-day demographic/insurance re-verification | New | M02 | P1 | Encounter, Coverage | Build [NEW] |  |
| Case Record | Time-Out Checklist | Right-patient/procedure/site structured confirmation | New | M04 | P1 | QuestionnaireResponse, Provenance | Build [NEW] |  |
| Case Record | Time-Out Checklist | Timestamped and signed | Yes -- signed-record pattern | M04 | P1 | QuestionnaireResponse, Provenance | Port [MS] |  |
| Case Record | Time-Out Checklist | Multi-role team attestation | New | M04 | P1 | QuestionnaireResponse, Provenance | Build [NEW] |  |
| Case Record | Anesthesia Record | Time-series vitals at required intervals | New | M07 | P1 | Observation series, MedicationAdministration; Agent HL7 (P1.5) | Build [NEW] | Real build item -- MindScript doesn't have time-series vitals yet |
| Case Record | Anesthesia Record | Medication administration log | New | M07 | P1 | Observation series, MedicationAdministration; Agent HL7 (P1.5) | Build [NEW] |  |
| Case Record | Anesthesia Record | Sedation-level tracking | New | M07 | P1 | Observation series, MedicationAdministration; Agent HL7 (P1.5) | Build [NEW] |  |
| Case Record | Procedure Note | Indication capture | Yes | M05 | P1 | Procedure, Observation, Specimen, Composition | Port [MS] |  |
| Case Record | Procedure Note | Findings by anatomic location, structured | Yes | M05 | P1 | Procedure, Observation, Specimen, Composition | Port [MS] |  |
| Case Record | Procedure Note | Intervention detail (polyp size/location/morphology) | New field set, reused pattern | M05 | P1 | Procedure, Observation, Specimen, Composition | Port + extend [MS] |  |
| Case Record | Procedure Note | Specimens-sent tracking | New | M05 | P1 | Procedure, Observation, Specimen, Composition | Build [NEW] |  |
| Case Record | Procedure Note | Complications field | New | M05 | P1 | Procedure, Observation, Specimen, Composition | Build [NEW] |  |
| Case Record | Procedure Note | Diagnosis-bound to Assessment | Yes | M05 | P1 | Procedure, Observation, Specimen, Composition | Port [MS] |  |
| Case Record | Circulating Nurse Note | Counts (sponge/instrument) | New | M04 | P1 | Questionnaire, Procedure | Build [NEW] |  |
| Case Record | Circulating Nurse Note | Positioning documentation | New | M04 | P1 | Questionnaire, Procedure | Build [NEW] |  |
| Case Record | Circulating Nurse Note | Equipment used | New | M04 | P1 | Questionnaire, Procedure | Build [NEW] |  |
| Case Record | Specimen Tracking | Specimen ID ⇄ patient/procedure linkage | New | M10 | P1 | Specimen, ServiceRequest, Task | Build [NEW] |  |
| Case Record | Specimen Tracking | Pathology lab hand-off tracking | New | M10 | P1 | Specimen, ServiceRequest, Task | Build [NEW] |  |
| Case Record | Specimen Tracking | Feeds closed-loop pathology follow-up | Yes -- Recovery Queue engine | M10 | P1 | Specimen, ServiceRequest, Task | Port [MS] |  |
| Case Record | Recovery/PACU Note | Aldrete score calculation | New | M08 | P1 | Observation, Questionnaire | Build [NEW] |  |
| Case Record | Recovery/PACU Note | Discharge-readiness criteria checklist | New | M08 | P1 | Observation, Questionnaire | Build [NEW] |  |
| Case Record | Recovery/PACU Note | Vitals at recovery intervals | Yes -- reuse | M08 | P1 | Observation, Questionnaire | Port [MS] |  |
| Case Record | Discharge Summary | Auto-generated from procedure note + recovery data | Yes -- note-gen pattern | M08 | P1 | Composition, Binary (PDF bot) | Port [MS] |  |
| Case Record | Discharge Summary | Patient-facing instructions version | New | M08 | P1 | Composition, Binary (PDF bot) | Build [NEW] |  |
| Case Record | Discharge Summary | Referring-physician version | New | M08 | P1 | Composition, Binary (PDF bot) | Build [NEW] | See Referring Physician Routing |
| Money | Coding Assist | Auto-detect screening-to-diagnostic conversion | Yes -- strongest reuse case | M09 | P1 | ChargeItem, Provenance; CodeSystem (CPT licensed) | Port [MS] | Highest-stakes coding decision in the system |
| Money | Coding Assist | PT modifier logic (Medicare) | New logic, reused binding | M09 | P1 | ChargeItem, Provenance; CodeSystem (CPT licensed) | Port + extend [MS] |  |
| Money | Coding Assist | Modifier 33 logic (commercial/ACA) | New logic, reused binding | M09 | P1 | ChargeItem, Provenance; CodeSystem (CPT licensed) | Port + extend [MS] |  |
| Money | Coding Assist | Correct CPT selection (45380/45385/etc.) | New | M09 | P1 | ChargeItem, Provenance; CodeSystem (CPT licensed) | Build [NEW] |  |
| Money | Coding Assist | Anesthesia-line modifier propagation | New | M09 | P1 | ChargeItem, Provenance; CodeSystem (CPT licensed) | Build [NEW] | Easy to miss, real denial risk |
| Money | Coding Assist | Diagnosis-code sequencing (finding primary) | New | M09 | P1 | ChargeItem, Provenance; CodeSystem (CPT licensed) | Build [NEW] |  |
| Money | Charge Capture | Facility-fee capture | Yes | M09 | P1 | ChargeItem | Port [MS] |  |
| Money | Charge Capture | Physician-fee capture | Yes | M09 | P1 | ChargeItem | Port [MS] |  |
| Money | Charge Capture | Both bound to diagnosis-coded procedure note | Yes | M09 | P1 | ChargeItem | Port [MS] |  |
| Money | Claims Engine | Clearinghouse connection/submission | New | M19 | P3 | Claim; Stedi / Candid integrations | Build [NEW] |  |
| Money | Claims Engine | Claim-status tracking | New | M19 | P3 | Claim; Stedi / Candid integrations | Build [NEW] |  |
| Money | Claims Engine | Denial flagging | New | M19 | P3 | Claim; Stedi / Candid integrations | Build [NEW] |  |
| Money | Prior Auth Tracker | UTN capture for CMS PA Demonstration services | New | M09 | P2 | Coverage, ClaimResponse / extension | Build [NEW] |  |
| Money | Prior Auth Tracker | Auto-population into correct claim field | New | M09 | P2 | Coverage, ClaimResponse / extension | Build [NEW] |  |
| Money | Prior Auth Tracker | Pre-payment-review risk flag if UTN missing | New | M09 | P2 | Coverage, ClaimResponse / extension | Build [NEW] |  |
| Money | Patient Estimate Calculator | Pre-procedure cost estimate generation | New | M09 | P2 | Coverage, ChargeItemDefinition | Build [NEW] |  |
| Money | Patient Estimate Calculator | Patient-facing display/delivery | New | M09 | P2 | Coverage, ChargeItemDefinition | Build [NEW] |  |
| Compliance | Scope Reprocessing Log | Scope ID ⇄ patient/case linkage | New | X1 | P1 (recommended) | Device, Procedure | Build [NEW] |  |
| Compliance | Scope Reprocessing Log | Disinfection-cycle timestamp capture | New | X1 | P1 (recommended) | Device, Procedure | Build [NEW] |  |
| Compliance | Scope Reprocessing Log | Traceability audit report/export | New | X1 | P1 (recommended) | Device, Procedure | Build [NEW] |  |
| Compliance | ASCQR Reporting Module | Security Official/HARP registration tracking | New | M13 | P2 | Search / Bulk export; scheduled bot | Build [NEW] |  |
| Compliance | ASCQR Reporting Module | HQR-channel measure tracking | New | M13 | P2 | Search / Bulk export; scheduled bot | Build [NEW] |  |
| Compliance | ASCQR Reporting Module | OAS CAHPS survey distribution management | New | M13 | P2 | Search / Bulk export; scheduled bot | Build [NEW] |  |
| Compliance | ASCQR Reporting Module | Colonoscopy claims-derived measure visibility | New | M13 | P2 | Search / Bulk export; scheduled bot | Build [NEW] | Auto-calculated by CMS; monitor, don't resubmit |
| Compliance | GIQuIC Export | Map Procedure Note to Colonoscopy Data Collection Form | Yes, strong | M13 | P2 | Search / Bulk export; scheduled bot | Port [MS] |  |
| Compliance | GIQuIC Export | Map to EGD Data Collection Form | Yes, strong | M13 | P2 | Search / Bulk export; scheduled bot | Port [MS] |  |
| Compliance | GIQuIC Export | Submission/export mechanism | New | M13 | P2 | Search / Bulk export; scheduled bot | Build [NEW] |  |
| Compliance | GIQuIC Export | MIPS QCDR reporting flag | New | M13 | P2 | Search / Bulk export; scheduled bot | Build [NEW] | Same data, second reporting obligation satisfied |
| Compliance | Sign Queue | Incomplete-chart flagging | Yes -- exists in MindScript today | M12 | P1 | Task | Port [MS] |  |
| Compliance | Sign Queue | Regulatory-deadline countdown per chart | New | M12 | P1 | Task | Build [NEW] |  |
| Compliance | Sign Queue | Role-based worklist view | New | M12 | P1 | Task | Build [NEW] |  |
| Compliance | Infection Control & Adverse Event Tracking | Internal infection surveillance log | New | X2 | P1 incident form / P2 surveillance | AdverseEvent, Questionnaire, Task | Build [NEW] | NEW -- dropped earlier, restored |
| Compliance | Infection Control & Adverse Event Tracking | Adverse-event/incident reporting workflow | New | X2 | P1 incident form / P2 surveillance | AdverseEvent, Questionnaire, Task | Build [NEW] | NEW |
| Compliance | Infection Control & Adverse Event Tracking | NHSN OPC-SSI-ready data capture | New | X2 | P1 incident form / P2 surveillance | AdverseEvent, Questionnaire, Task | Build [NEW] | Voluntary federally; not FL-mandated. Build capture now, enroll later if needed. |
| Compliance | Audit Logging | Access/action audit trail | New | M12 | P1 | AuditEvent (automatic) | Configure [MP] | NEW -- HIPAA requirement, no prior row |
| Compliance | Audit Logging | Exportable audit reports | New | M12 | P1 | AuditEvent (automatic) | Build [NEW] | NEW |
| Patient Experience | Recovery Queue (pathology variant) | Auto-resolve on pathology result arrival | Yes -- same engine | M10 | P1 | Task, DiagnosticReport, Bot | Port [MS] |  |
| Patient Experience | Recovery Queue (pathology variant) | Unresolved-result alerting | Yes | M10 | P1 | Task, DiagnosticReport, Bot | Port [MS] |  |
| Patient Experience | Patient Messaging | Two-way texting infrastructure | Possible shared infra w/ Vapi stack | M14 | P2 | Communication; Twilio bot | Configure [MP] |  |
| Patient Experience | Patient Messaging | Bowel-prep reminder sequence | New | M14 | P2 | Communication; Twilio bot | Build [NEW] |  |
| Patient Experience | Patient Messaging | Pre-op instruction delivery | New | M14 | P2 | Communication; Twilio bot | Build [NEW] |  |
| Patient Experience | Patient Messaging | Post-discharge check-in | New | M14 | P2 | Communication; Twilio bot | Build [NEW] |  |
| Patient Experience | Case Cost Tracker | Supply/implant cost capture per case | New | M15 | P2 | ChargeItem, SupplyDelivery | Build [NEW] |  |
| Patient Experience | Case Cost Tracker | Reimbursement-vs-cost comparison | New | M15 | P2 | ChargeItem, SupplyDelivery | Build [NEW] |  |
| Patient Experience | Case Cost Tracker | Per-physician/procedure profitability rollup | New | M15 | P2 | ChargeItem, SupplyDelivery | Build [NEW] |  |
| Patient Experience | Inventory Management | Supply stock tracking | New | M15 | P2 | Device, SupplyDelivery | Build [NEW] |  |
| Patient Experience | Inventory Management | Reorder alerting | New | M15 | P2 | Device, SupplyDelivery | Build [NEW] |  |
| Patient Experience | Inventory Management | Implant/high-cost device lot tracking | New | M15 | P2 | Device, SupplyDelivery | Build [NEW] |  |
| Patient Experience | Patient Portal | Results access | New | M14 | P2 | Patient-scoped AccessPolicy; foomedical reference | Build [NEW] |  |
| Patient Experience | Patient Portal | Self-scheduling | New | M14 | P2 | Patient-scoped AccessPolicy; foomedical reference | Build [NEW] |  |
| Patient Experience | Patient Portal | Document upload (insurance/ID) | New | M14 | P2 | Patient-scoped AccessPolicy; foomedical reference | Build [NEW] |  |
| Patient Experience | Staff & Credentialing Tracker | Staff scheduling | New | M16 | P2 | PractitionerRole, Practitioner.qualification | Build [NEW] |  |
| Patient Experience | Staff & Credentialing Tracker | Physician privileging/credentialing expiration tracking | New | M16 | P2 | PractitionerRole, Practitioner.qualification | Build [NEW] |  |
| Patient Experience | Staff & Credentialing Tracker | Anesthesia provider coordination | Cross-ref Foundation scheduling | M16 | P2 | PractitionerRole, Practitioner.qualification | Build [NEW] |  |
| Patient Experience | Referring Physician Routing | Auto-send discharge summary/procedure note to referrer | New | M17 | P1 outbound fax / P2 rest | Communication, eFax bot | Build [NEW] | NEW -- most GI ASC volume is referral-driven |
| Patient Experience | Referring Physician Routing | Inbound referral intake tracking | New | M17 | P1 outbound fax / P2 rest | Communication, eFax bot | Build [NEW] | NEW |
| Patient Experience | Referring Physician Routing | Waitlist management for earlier openings | New | M17 | P1 outbound fax / P2 rest | Communication, eFax bot | Build [NEW] | NEW |
| Patient Experience | User Roles & Permissions | Role definitions (RN/MA/physician/front desk/billing/anesthesia) | New | M12 | P1 | AccessPolicy, ProjectMembership, Medplum App | Configure [MP] | NEW -- real platform requirement, no row existed |
| Patient Experience | User Roles & Permissions | Permission scoping per role | New | M12 | P1 | AccessPolicy, ProjectMembership, Medplum App | Configure [MP] | NEW |
| Patient Experience | User Roles & Permissions | Role assignment/management UI | New | M12 | P1 | AccessPolicy, ProjectMembership, Medplum App | Configure [MP] | NEW |
| Patient Experience | Document Management | General document upload/storage | New | M02 | P1 | DocumentReference, Binary | Configure [MP] | NEW -- referral letters, external records, ID/insurance scans |
| Patient Experience | Document Management | Document ⇄ patient/encounter linkage | New | M02 | P1 | DocumentReference, Binary | Configure [MP] | NEW |
| Patient Experience | Document Management | Retrieval/search | New | M02 | P1 | DocumentReference, Binary | Configure [MP] | NEW |
| Maturity | Analytics Dashboard | GIQuIC peer benchmarking view | Yes -- extends planned dashboard | M18 | P3 | Bulk export / Snowflake | Port [MS] |  |
| Maturity | Analytics Dashboard | Financial/operational KPI rollup | New | M18 | P3 | Bulk export / Snowflake | Build [NEW] |  |
| Maturity | Multi-Site Architecture | Multi-tenant data model | New | M22 | P3 (model ready P1) | Organization compartments, AccessPolicy | Configure [MP] |  |
| Maturity | Multi-Site Architecture | Cross-site reporting | New | M22 | P3 (model ready P1) | Organization compartments, AccessPolicy | Build [NEW] |  |
| Maturity | Payer Intelligence | Payer-specific contract/rate visibility | Possible tie-in to Lumen, unconfirmed | M18 | P3 | - | Build [NEW] |  |

## Spec-only rows (not in the roadmap sheet)

| Area | Feature | Req | Phase | Medplum primitive | Build type |
|---|---|---|---|---|---|
| Scheduling | Wait-list & reschedule, no-show tracking | M01 | P1 | Appointment status, Task | Port + extend [MS] |
| Registration | Duplicate patient detection + merge | M02 | P1 | Patient.link | Build [NEW] |
| Registration | Referring provider on file (NPI lookup) | M02 | P1 | Practitioner; NPPES bot example | Configure [MP] |
| Intake | Risk screening & clearance (cardiac/airway/bleeding/OSA) | M03 | P1 | Questionnaire, Observation | Build [NEW] |
| Nursing | Counts & safety attestations | M04 | P1 | QuestionnaireResponse, Provenance | Build [NEW] |
| Procedure note | Quality data at point of documentation (BBPS, cecal landmarks, withdrawal time) | M05 | P1 | Observation | Build [NEW] |
| Procedure note | Per-physician documentation preferences | M05 | P1 | Practitioner-scoped config | Build [NEW] |
| Procedure note | AI narration to structured note (draft + confirm) | M05 | P1 | Composition (preliminary), Provenance | Build [NEW] |
| Images | Image attach to case + finding | M06 | P1 | Media, Binary (Azure Blob) | Build [NEW] |
| Images | Annotation & selection for report | M06 | P1 | Media | Build [NEW] |
| Images | Scope-tower live capture | M06 | P1.5 | Agent DICOM C-STORE + Bot | Configure [MP] |
| AIMS | Monitor / machine device capture | M07 | P1.5 | Agent HL7 v2 MLLP + Bot | Configure [MP] |
| AIMS | Offline-tolerant entry | M07 | P1 | - (client queue) | Build [NEW] |
| AIMS | Anesthesia time to charge | M07 | P1 | ChargeItem | Build [NEW] |
| Discharge | Follow-up & recall (finalized after pathology) | M08 | P1 | CarePlan / ServiceRequest, Task | Build [NEW] |
| Coding | Clean charge export in biller format | M09 | P1 | Claim; Stedi if 837 | Build [NEW] |
| Coding | Code to evidence audit trail | M09 | P1 | Provenance, ChargeItem refs | Build [NEW] |
| Pathology | Requisition generation + lab routing | M10 | P1 | ServiceRequest, PDF bot, eFax | Configure [MP] |
| Consents | E-signature (patient/guardian/witness) | M11 | P1 | Consent, Binary | Build [NEW] |
| Consents | Facility & regulatory forms | M11 | P1 | Questionnaire | Configure [MP] |
| Security | MFA, SSO, session timeout | M12 | P1 | Medplum Auth + Entra IdP | Configure [MP] |
| Security | Break-glass access | M12 | P1 | AccessPolicy + @asc/audit | Build [NEW] |
| Security | Encryption, BAA hosting, backup/restore | M12 | P1 | Azure Postgres PITR, Blob | Configure [MP] |
| Ops | Downtime packet + back-entry | NFR | P1 | Search + PDF bot | Build [NEW] |
| Quality | CAHPS vendor interface | M13 | P2 | Bulk export / SFTP bot | Build [NEW] |
| Engagement | Digital pre-registration & intake forms | M14 | P2 | Questionnaire; patient-intake demo | Configure [MP] |
| Engagement | Check-in kiosk | M14 | P2 | Patient AccessPolicy | Build [NEW] |
| Preference cards | Preference cards & order sets | M16 | P2 | PlanDefinition / ActivityDefinition | Build [NEW] |
| Interop | HL7/FHIR interfaces, bidirectional lab, HIE | M20 | P3 | FHIR API, Agent, Health Gorilla | Configure [MP] |
| Interop | eCW bridge (Integuru) | M20 | P3 | FHIR API | Build [NEW] |
| AI | Ambient documentation across full case; real-time coding/compliance checks; surveillance CDS | M21 | P3 | CDS Hooks | Build [NEW] |
| Expansion | Additional specialties (pain, pulm, ortho) | M22 | P3 | Profiles + Questionnaires | Build [NEW] |
