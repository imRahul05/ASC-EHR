# ASC OS — Requirements Document

## GI Ambulatory Surgery Center EHR and Operating System

Oct 7, 2026 · Owner @Anurag Chatterjee · Draft for engineering review

## 1. Purpose and scope

ASC OS is the sole electronic health record and operating system for a new single-specialty GI ambulatory surgery center. There is no legacy EHR to migrate from and no fallback system. On opening day, every patient record, schedule, clinical note, specimen label, claim and quality measure originates here.

That constraint drives every requirement in this document. A feature that is merely incomplete in a practice with a paper backup becomes a stopped procedure here.

### Reference point

The functional baseline is the eClinicalWorks ASC module, which a GI center would otherwise buy. Centers moving to it describe the core as pre-op, intra-op and post-op documentation, inventory management tracking, and access to patient history, unified with scheduling, billing and patient engagement. eCW also ships previsit planning, patient self check-in with copay collection and questionnaires, integrated continuous vital-signs devices, and an ambient documentation layer.

ASC OS must match that functional surface for GI. Where this document departs from eCW, it is deliberate and marked.

### What ASC OS adds

The differentiator is not the record. It is the operational layer above it: readiness tracking per case, autonomous financial clearance, ambient clinical capture, and coding that understands GI's multiple-endoscopy rules. Those are specified in sections 5, 8, 11, 14 and 18.

### Who this is for

Engineers building the system. It specifies behaviour, data, and state transitions. It does not specify the UI, framework choices or deployment topology except where a requirement constrains them.

### How to read it

Sections 2 to 5 are foundational and should be read in order by everyone. Sections 6 to 17 are the functional modules in roughly the order a case moves through them. Sections 18 to 22 are cross-cutting.

Requirements use **must** for mandatory, **should** for strongly preferred, **may** for optional. Anything marked **OPEN** needs a decision from Anurag before that module is built; all open items are collected in section 22.

### Terminology

| Term | Meaning here |
| --- | --- |
| Case | One patient, one visit, one or more procedures, in one room on one date. The central object. |
| Encounter | The clinical record attached to a case. One per case. |
| Procedure | A single billable intervention within a case. A case may hold several. |
| Stage | Where a case physically is right now (scheduled, checked in, in room, PACU, discharged). |
| Readiness | Whether a case is cleared to proceed. Independent of stage. |
| Block | A recurring reserved span of room time assigned to a physician. |
| Turnover | Room time between one patient leaving and the next entering. |

## 2. Regulatory baseline

An ASC is not required to use certified EHR technology. ASCs are not eligible for the Medicare Promoting Interoperability program, and clinicians furnishing 75% or more of their covered services in place of service 24 hold ASC-based special status under MIPS, which reweights the Promoting Interoperability category to 0%. This removes ONC certification from the critical path.

That is the single most important regulatory fact for this build. Do not design around certification requirements that do not apply.

### What does apply

| Requirement | Source | What the system must do |
| --- | --- | --- |
| HIPAA Privacy and Security Rules | 45 CFR 160, 164 | Access controls, unique user identification, automatic logoff, encryption at rest and in transit, audit controls, integrity controls |
| Medicare Conditions for Coverage | 42 CFR 416 | Complete medical record per patient, H&P within 30 days with pre-procedure update, informed consent, discharge documentation, transfer agreement records |
| ASCQR Program | CMS | Capture and submit required quality measures; see section 16 |
| Accreditation (AAAHC, ACHC or Joint Commission) | Accreditor standards | Record completeness, timeliness of documentation, credential tracking, QAPI evidence |
| State licensure and reporting | Florida AHCA | Facility licensure records, adverse incident reporting, state-specific retention |
| Controlled substances | DEA, state PDMP | Administration records for sedation agents; PDMP query where state requires |

### Record completeness rules the system must enforce

1. Every case must carry an H&P dated within 30 days of the procedure, plus a pre-procedure update note confirming no interval change. The system must block check-in completion when the H&P is absent or expired, with an override that records who overrode it and why.
2. Informed consent must be captured before sedation begins, naming the specific procedure and the performing physician.
3. The procedure note must be completed and signed before the patient is discharged, or an immediate post-procedure note must exist documenting findings, specimens and complications.
4. Discharge must record the patient's condition, who accompanied them, and the instructions given.

### Retention

Retain the full record for the longest applicable period — Florida requires adult records be kept at least five years from the last encounter, and Medicare requires five years. Design for indefinite retention; deletion is a deliberate administrative action, never automatic.

### Not in scope for certification

ASC OS does not need to pass ONC criteria, does not need to support Promoting Interoperability measures, and does not need a certified clinical quality measure engine. It must still produce accurate ASCQR submissions, which is a reporting problem, not a certification problem.

**OPEN** — which accreditor the center will use. AAAHC, ACHC and Joint Commission differ in documentation detail, and section 16's measure set depends on the answer.

## 3. Roles and access control

Access is role-based with a facility scope. Every user belongs to exactly one facility and holds one or more roles. Permissions are additive across roles.

| Role | Sees | Can do | Cannot do |
| --- | --- | --- | --- |
| Physician | Own cases in full; all cases read-only | Sign notes, approve codes, set surveillance interval, order | See financial clearance detail beyond auth status; edit another physician's signed note |
| Anesthesia | Cases on today's schedule | Pre-anaesthesia assessment, anaesthesia record, PACU orders | Sign procedure notes, touch billing |
| Pre-op nurse | Scheduled and checked-in cases | Intake, vitals, H&P update, consent capture, medication reconciliation | Sign physician documentation, release claims |
| Circulating / procedure nurse | Cases in room today | Timeout, intra-op log, specimen labelling, supply usage | Code, sign notes |
| PACU nurse | Cases in recovery | Recovery scoring, discharge criteria, discharge instructions | Edit intra-op record |
| Front desk | All cases, demographics, schedule | Register, schedule, check in, collect payment | Clinical documentation of any kind |
| Financial clearance | All cases, full payer detail | Eligibility, benefits, prior auth, estimates | Clinical documentation, clinical ordering |
| Coder / biller | Completed cases, full clinical record | Finalize codes, build and submit claims, work denials | Alter clinical documentation; sign on behalf of a physician |
| Materials manager | Inventory, usage, preference cards | Receive, count, adjust, set par levels | Patient clinical data beyond case supply usage |
| Administrator | Everything | Configuration, user management, override any gate | Alter an audit record |
| Quality / infection control | De-identified operational data; identified on demand | QAPI entries, incident reports, measure review | Edit the clinical record |

### Rules

1. Role assignment is per facility. A user with no role at a facility sees nothing belonging to it, including the existence of its patients.
2. Break-glass access must exist for emergencies: any user may elevate to read a record outside their normal scope by stating a reason. The elevation is time-boxed to the shift, logged with the reason, and surfaced on a daily report the administrator reviews.
3. Every override of a hard gate — expired H&P, missing consent, unverified anticoagulation hold, releasing a claim without physician code approval — records actor, timestamp, reason and the state that was overridden. Overrides are never silent.
4. Signed clinical documentation is immutable. Corrections are addenda that reference the original, carry their own signature and timestamp, and never replace the original text.
5. A physician cannot be impersonated. No role may sign, attest or approve codes on a physician's behalf, including the administrator.
6. Session timeout is 15 minutes of inactivity in clinical areas and 5 minutes on shared workstations, configurable per device class. Re-entry requires full authentication, not a PIN, unless the device is registered as a personal badge-tap station.

### Credentialing

The system must hold, for each clinical user, their licence number and expiry, DEA registration where applicable, board certification, malpractice coverage dates, facility privileges and their renewal date, and immunization and training records the accreditor requires. A user whose licence or privileges have lapsed must be blocked from documenting and the administrator notified 90, 60 and 30 days ahead of each expiry.

## 4. Facility configuration and master data

Everything below is configured before the first patient is scheduled. None of it is hard-coded. All of it is versioned, because a change to a procedure's default duration must not retroactively alter cases already scheduled under the old value.

### Facility

Legal name, DBA, address, NPI (type 2), tax ID, CMS certification number, state licence number and expiry, accreditor and survey dates, time zone, and the transfer agreement hospital with its contact details. Operating hours and holiday calendar.

### Rooms and locations

Procedure rooms, pre-op bays, PACU bays, each with a capacity and a type. A GI center typically runs two procedure rooms, six to eight pre-op bays and six to eight PACU bays. The ratio matters: PACU capacity, not room capacity, is usually what caps throughput, and the scheduler in section 7 must model both.

### Providers

Physicians, anaesthesia providers and CRNAs, each with NPI, specialty, credentials, privileges granted at this facility, and the procedure types they are privileged for. A case cannot be scheduled with a physician who lacks privileges for that procedure type.

### Procedure catalog

The spine of the system. Each entry holds:

1. Internal name and synonyms staff actually say ("colon", "scope", "EGD").
2. Default CPT code or codes, with the understanding that final coding comes from documentation, not the schedule.
3. Default duration, split into room time and physician time, and the default turnover that follows it.
4. Required equipment and scope type.
5. Default preference card.
6. Whether it routinely produces specimens.
7. Typical anaesthesia type.
8. Whether prior authorization is usually required, by payer class.

For GI the catalog is small — screening colonoscopy, surveillance colonoscopy, diagnostic colonoscopy, colonoscopy with polypectomy, EGD, EGD with biopsy, EGD with dilation, combined EGD and colonoscopy, flexible sigmoidoscopy, PEG placement, capsule endoscopy, hemorrhoid banding. Small enough to curate by hand, and it must be curated by hand.

### Preference cards

Per physician, per procedure: scope model, accessories, snares, forceps, injection agents, clips, CO2 settings, patient positioning, and anything the physician wants in the room. Preference cards drive both the pick list before the case and the usage capture during it. They are versioned, and a case records which version was used.

### Payers

Payer name, payer ID for claims, clearinghouse identifier, plan types carried, contracted rates where known, prior auth requirements by procedure type, timely filing limit, and the portal or phone route for authorization. The authorization requirement matrix — payer × procedure × whether auth is needed — is what section 8 queries on every booking.

### Code sets

CPT, ICD-10-CM, HCPCS, modifiers, and the CMS ASC covered procedures list with payment indicators. These are licensed data; CPT in particular requires an AMA licence. **OPEN** — confirm the AMA CPT licence is in hand before coding features ship.

### Clinical templates

Procedure note templates per procedure type, consent forms, discharge instruction sets per procedure, prep instruction sets per prep agent, and the standard order sets. All versioned, all with an effective date, all carrying the version used into each case's record.

## 5. Core data model and the case lifecycle

The Case is the central object. Everything else hangs off it. Get this right and the rest of the system follows; get it wrong and every module compensates for it.

### The central rule: stage and readiness are orthogonal

A case has a **stage** — where the patient physically is — and a **readiness** — whether the case is cleared to proceed. They move independently and must never be collapsed into one status field.

A case can be checked in (stage) and financially uncleared (readiness). A case can be fully cleared and not yet arrived. Every EHR that models this as one status ends up with statuses like "checked in but auth pending", then "checked in, auth pending, H&P expired", and the enum grows until nobody can reason about it.

| Stage | Meaning | Set by |
| --- | --- | --- |
| requested | Referral received, not yet scheduled | Intake |
| scheduled | Date, room and physician assigned | Scheduling |
| confirmed | Patient has confirmed attendance | Patient or outreach |
| arrived | Patient physically present | Front desk |
| preop | In a pre-op bay | Pre-op nurse |
| in\_room | In the procedure room | Circulator |
| procedure\_start | Scope in | Circulator |
| procedure\_end | Scope out | Circulator |
| pacu | In recovery | PACU nurse |
| discharged | Left the building | PACU nurse |
| cancelled | Will not happen | Any, with reason |
| no\_show | Did not arrive | Front desk |

Stage transitions are strictly forward except for explicit, logged reversals (a patient returned from the room to pre-op). Each transition records actor and timestamp. These timestamps are the raw material for every operational metric in section 16 — do not treat them as incidental.

### Readiness

Readiness is computed, never stored as a user-set value. It is the aggregate of a set of named checks, each of which is satisfied, pending, failed or waived.

| Check | Satisfied when |
| --- | --- |
| identity | Patient matched to a single record, DOB and name verified |
| coverage | Active eligibility response on file, dated within 30 days of the procedure |
| benefits | Deductible, coinsurance and out-of-pocket captured |
| authorization | Auth on file and valid on the procedure date, or payer confirmed not required |
| estimate | Patient responsibility calculated and communicated |
| consent | Signed consent naming this procedure and physician |
| hp | H&P within 30 days, plus pre-procedure update |
| anticoagulation | Hold confirmed, or documented as not applicable |
| anesthesia\_clearance | Pre-anaesthesia assessment complete, ASA assigned |
| prep | Prep instructions delivered and patient confirmation obtained |
| escort | Responsible adult confirmed for discharge |
| equipment | Required scope and accessories available and reprocessed |

The overall readiness is ready when every check is satisfied or waived, blocked when any is failed, and pending otherwise. The UI shows which specific check is blocking; it never shows only a colour.

A waiver requires a role permitted to waive that check, a reason, and a timestamp. Some checks cannot be waived: consent and identity.

### Hard gates

Three transitions are blocked by readiness and cannot proceed without an explicit, logged override:

1. arrived → preop requires identity, consent and hp.
2. preop → in\_room requires anesthesia\_clearance, anticoagulation, equipment and escort.
3. Claim release (section 15) requires physician code approval.

Everything else is advisory. Financial checks never block a clinical transition — a patient who has arrived gets their procedure, and the financial problem becomes a work item, not a barrier at the bay.

### Object graph

| Object | Relationship | Notes |
| --- | --- | --- |
| Patient | 1 → many Cases | Demographics, identifiers, contacts |
| Coverage | many per Patient | Payer, member ID, effective dates, rank (primary, secondary) |
| Referral | 0 or 1 → Case | Source document, referring provider, extracted fields |
| Case | the hub | Stage, readiness, room, date, physician |
| Procedure | many per Case | Planned and performed; the performed set drives coding |
| Encounter | 1 per Case | The clinical container |
| Finding | many per Procedure | Location, size, morphology, action taken |
| Specimen | many per Case | Container label, source finding, destination lab |
| Document | many per Case or Patient | Any file, with type and provenance |
| WorkItem | many per Case | A unit of staff or agent work, with owner and due date |
| Authorization | 0 or more per Case | Its own lifecycle, section 8 |
| Charge | many per Case | Derived from performed procedures and findings |
| Claim | 1 or more per Case | Facility claim; professional claim billed separately |
| AuditEvent | append-only | Every read and write of PHI |

### Work items

Every unresolved thing is a work item, whether a human or an agent will do it. A work item has a type, a target case, an owner (role or named user or agent), a due time, a priority, a state, and a resolution. Staff queues are filtered views over work items. Agent actions create and resolve work items through the same mechanism, which is what makes agent activity auditable alongside human activity.

This is the single most important architectural decision in the system after the stage/readiness split: there is one work model, not a human one and an agent one.

## 6. Referral intake and patient registration

A GI ASC's demand arrives almost entirely as inbound referrals from primary care, and almost entirely by fax. This module is the front of the funnel; everything downstream is starved if it leaks.

### Channels

| Channel | Volume | Handling |
| --- | --- | --- |
| Fax (inbound) | Dominant | Received as PDF or TIFF via eFax provider, queued for extraction |
| Direct secure messaging | Growing | Parsed as C-CDA where structured |
| Referring office portal | Build in phase 2 | Structured submission, no extraction needed |
| Phone | Steady | Staff keys directly into an intake form |
| Patient self-referral | Occasional for screening | Web form, routed for triage |

### The incoming item

Everything inbound becomes an IncomingItem before it becomes anything else: a raw document, its source channel, received timestamp, page count, and a kind that extraction assigns (referral, insurance card, pathology result, prior records, correspondence, unknown). Nothing is discarded; an item classified unknown goes to a human queue, never to the bin.

### Extraction

An extraction pass reads each item and produces structured candidate fields with a per-field confidence score:

Patient first, middle and last name, DOB, sex, address, phone, email. Insurance payer, member ID, group number. Referring provider name and NPI, referring practice, phone and fax. Requested procedure. Indication and any stated diagnosis. Relevant history: anticoagulants, prior endoscopy dates and findings, allergies.

Every extracted field carries its confidence and a pointer to the source page and region. The UI must let a reviewer click a field and see where it came from on the document. This is non-negotiable: staff will not trust extraction they cannot verify in one click.

### Patient matching

On extraction, the system attempts to match to an existing patient:

1. **Exact match** — normalized last name, first name and DOB all agree, and no other record also matches. Auto-link.
2. **Probable match** — last name and DOB agree, first name is a known variant or initial. Present to a human with both records side by side.
3. **Possible match** — DOB agrees and last name is within a small edit distance, or name agrees and DOB is transposed. Present to a human.
4. **No match** — create a new patient record on human confirmation.

Never auto-create a patient and never auto-merge. Duplicate patient records are the most expensive data problem an EHR accumulates, and a merge tool is harder to build than the discipline that avoids needing it. Provide a duplicate-detection report the administrator reviews weekly, and a merge path that preserves both records' history and is reversible for 30 days.

### Registration

On first contact the patient record must capture: legal name and preferred name, DOB, sex at birth and gender identity if offered, address, phone (mobile flagged for SMS), email, preferred contact method and language, emergency contact, responsible party if not self, and insurance cards front and back as images.

**OPEN** — whether the center will collect race, ethnicity and language. Not required for ASC licensure but increasingly asked for by payers in quality programs.

### Triage

A referral is reviewed by a nurse or the physician before scheduling. Triage decides: accept and schedule, accept but request records first, redirect to office consultation, or decline with a reason sent back to the referring office. The outcome and who decided it are recorded on the referral.

Urgent indications — GI bleeding, suspected obstruction, abnormal imaging suggesting malignancy, positive FIT with symptoms — must be flagged by extraction and surfaced within one hour of receipt, not left in a queue overnight. Define the urgent-indication list with the physician before build.

## 7. Scheduling and block management

ASC scheduling is capacity allocation, not calendar booking. The unit of supply is room time inside a physician's block; the constraint that actually binds is usually PACU, not the room.

### Block time

Blocks are recurring reservations of a room for a physician: room, day pattern, start and end, effective date range. Standard GI pattern is a half-day block of four hours running twelve to fourteen cases.

Rules:

1. Within their own block, a physician's scheduler books freely.
2. Block release — unused block time returns to an open pool — happens automatically at a configurable horizon, typically 72 hours ahead. Notify the block owner when release occurs.
3. Block utilization is tracked and reported: scheduled minutes and actual in-room minutes as a percentage of block minutes. This is the number that governs whether the center adds rooms or redistributes blocks.

### Booking a case

On booking, the system must validate:

| Check | Behaviour on failure |
| --- | --- |
| Physician privileged for this procedure | Block the booking |
| Room equipped for this procedure | Block the booking |
| Required scope available and not already committed | Warn, allow with acknowledgement |
| Duration fits remaining block time | Warn, allow with acknowledgement |
| PACU capacity at projected recovery window | Warn |
| Patient has no other case that day | Warn |
| Age or comorbidity flags exceeding ASC criteria | Warn, route to anaesthesia review |

The ASC appropriateness screen deserves emphasis. A patient with severe comorbidity belongs in a hospital outpatient department, not a freestanding ASC, and the decision is cheapest at booking. Minimum triggers: ASA class IV or above, BMI above a configurable threshold, obstructive sleep apnoea with specified severity, unstable cardiac history, dialysis dependence, and age above a configurable limit. Any trigger routes the case to anaesthesia for review before it is confirmed.

### Duration and turnover

Scheduled duration comes from the procedure catalog default, adjusted by a per-physician factor the system learns from actual in-room times. Show the scheduler both: "catalog 30 min, Dr. R averages 24 min on this procedure over the last 50 cases." Do not silently auto-adjust; show the evidence and let the scheduler choose.

Turnover is scheduled explicitly as its own span. A center that does not schedule turnover runs late by 11 a.m. every day.

### Cancellations and no-shows

Every cancellation records a reason from a controlled list: patient cancelled, patient no-show, inadequate prep, patient unwell, anticoagulation not held, authorization not obtained, physician cancelled, facility or equipment issue, weather or closure. The reason list is the raw material for the cancellation-reduction work the center will do in its first year, so it must be structured, not free text.

Cancellation inside 24 hours should trigger an attempt to fill the slot from a short-notice waitlist: patients who have consented to be called for an earlier date, ranked by clinical urgency then by how long they have waited.

### Patient-facing scheduling

Self-scheduling for screening colonoscopy, where the patient has a referral on file and no appropriateness flags, should be offered in phase 2. It is the single highest-leverage patient-engagement feature for a screening-heavy GI center and it maps directly onto what eCW offers through its patient portal.

**OPEN** — will the center run a parallel office clinic? If so, scheduling must span both and the patient's record must be unified across them. This materially changes the model and must be answered before section 7 is built.

## 8. Financial clearance

This module decides whether the center gets paid, and it must finish before the patient arrives. It is also where most of the system's autonomous work happens.

### Eligibility

Submit an X12 270 inquiry and parse the 271 response. Run it at three points: on booking, seven days before the procedure, and on the morning of the procedure. Coverage lapses between booking and service date more often than anyone expects, and the morning check is what prevents a clean claim being denied for termination.

Store the full 271 response, not just the parsed summary. When a payer later disputes coverage, the raw response is the evidence.

Parse and surface: active or inactive, plan name and type, effective and termination dates, subscriber relationship, whether the ASC is in network, and the service-type-specific benefits.

Handle degradation explicitly. A 271 can return a valid response that is silent on the specific service type, or return generic plan-level benefits only. Those are not the same as "covered". The system must distinguish *confirmed covered*, *confirmed not covered*, and *response incomplete* — and never render the third as the first. An incomplete response produces a work item for human verification, not a green check.

### Benefits verification

Beyond eligibility, capture what the patient will owe: individual and family deductible and amount remaining, coinsurance percentage, copay, out-of-pocket maximum and remaining, the ASC-specific benefit (facility services at place of service 24), and whether the screening benefit applies at 100%.

The screening-versus-diagnostic distinction is the most consequential thing in GI billing. A screening colonoscopy is covered without cost sharing under preventive-services rules; the same procedure performed for symptoms is diagnostic and subject to deductible and coinsurance. And a screening colonoscopy that becomes therapeutic when a polyp is removed is a defined edge case with specific modifier handling (section 14). The estimate given to the patient before the procedure must state both scenarios, in writing.

### Prior authorization

Authorization has its own lifecycle, independent of the case stage:

| State | Meaning |
| --- | --- |
| not\_required | Payer rules say no auth needed for this procedure and plan |
| required | Determined necessary, not yet submitted |
| gathering | Assembling the clinical packet |
| submitted | Sent to payer, awaiting response |
| pended | Payer requesting more information |
| approved | Authorization number issued, with valid date range and approved units |
| denied | Denied, with reason |
| appealing | Under appeal |
| expired | Approved but valid range has passed the procedure date |

The system must determine whether auth is required from the payer configuration matrix, assemble the clinical packet (referral, indication, relevant history, prior endoscopy and pathology), submit through the available channel — X12 278 where the payer supports it, payer portal otherwise, fax as the last resort — and track the response.

An approved authorization must be validated against the actual procedure date whenever that date changes. A rescheduled case with an authorization valid only for the original window is one of the most common preventable denials in this specialty, and the system must catch it automatically on every reschedule.

When the procedure performed differs from the procedure authorized — a diagnostic colonoscopy that became a polypectomy — flag it at coding time. Most payers do not require a new auth for this, but the ones that do will deny, and the coder needs to see it before the claim goes out.

### Patient estimate and collection

Produce a written estimate combining the contracted or expected allowed amount, the benefit position, and the likely procedure variation. Deliver it to the patient at least three days before the procedure through their preferred channel, and record delivery and acknowledgement.

Collect the patient portion before or at check-in. Support card on file, payment plans, and a financial-hardship path. Note that the No Surprises Act good-faith-estimate requirement applies to uninsured and self-pay patients, and the system must generate one for them.

### Automation boundary

Eligibility, benefits parsing, auth requirement determination, packet assembly and submission run autonomously. Three things always require a human: accepting a coverage determination from an incomplete payer response, waiving a readiness check, and writing off or discounting a patient balance.

## 9. Pre-operative workflow

The window between scheduling and arrival. Everything that can cancel a case on the day is either prevented here or not prevented at all.

### The pre-op timeline

| When | What happens |
| --- | --- |
| At booking | Prep instructions and date confirmation sent; prep agent prescribed |
| 14 days before | Records requested from referring office if needed |
| 10 days before | Anticoagulation plan determined and prescriber contacted |
| 7 days before | Eligibility re-run; estimate delivered |
| 5 days before | Pre-op nursing call; health questionnaire completed |
| 3 days before | Anaesthesia review of flagged cases |
| 2 days before | Prep reminder with instructions; diet restrictions begin |
| 1 day before | Final confirmation call or message; arrival time, escort, NPO time |
| Morning of | Eligibility final check; prep confirmation |

Each row is a scheduled work item generated on booking. If the date moves, the whole timeline recomputes.

### History and physical

The H&P must exist, be dated within 30 days of the procedure, and be supplemented by a pre-procedure update confirming no interval change. Sources: the referring physician's H&P, or one performed by the ASC's own physician.

The system must track H&P expiry against the procedure date continuously, not just at check-in, and surface an expiring H&P as a work item at seven days. Waiting until the morning to discover an expired H&P is a same-day cancellation.

### Anticoagulation

The highest-value pre-op item in GI and the one most often mishandled.

Capture for every patient: whether they take any anticoagulant or antiplatelet, the agent and dose, the indication, the prescribing physician, and that physician's hold instruction with the date it was given.

The system must compute a recommended hold window from the agent and the procedure's bleeding risk, present it to the nurse as a suggestion, require the prescriber's actual instruction to be recorded before the check is satisfied, and verify on the confirmation call that the patient actually held it.

The recommendation is advisory. The system never tells a patient to stop a blood thinner; it tells staff what to ask the prescriber. Build this as a configurable rule table reviewed and signed off by the physician, versioned, with the version recorded on each case.

### Health questionnaire

Delivered digitally where the patient can, by phone where they cannot. Covers: current medications including supplements, allergies and reaction type, prior anaesthesia problems, cardiac and pulmonary history, sleep apnoea and CPAP use, diabetes and insulin regimen, pregnancy status where applicable, mobility and transfer needs, prior abdominal surgery, and prior difficult endoscopy.

Responses feed the anaesthesia assessment rather than replacing it.

### Anaesthesia assessment

For every case: airway assessment with Mallampati, ASA physical status, anaesthesia plan (MAC is standard for GI), NPO instruction, and any special precautions. Cases flagged at booking for appropriateness get a documented anaesthesia review before confirmation.

### Prep

Prescribe the prep agent, deliver instructions in the patient's language at a reading level that works, and confirm comprehension on the pre-op call. Split-dose preparation is standard and the timing of the second dose relative to the procedure time drives prep quality, so the instructions must be personalized to the actual arrival time, not generic.

On the confirmation call, ask the specific question — what the effluent looked like — and record the answer. An inadequate prep discovered the day before is a reschedule; discovered in the room it is a wasted slot and a repeat procedure.

### Escort and transport

Sedation requires a responsible adult to accompany the patient home. Confirm the escort's name and phone on the day-before call and record it. No escort is a hard stop at the pre-op gate, and it is one of the most common day-of cancellations, so it must be asked explicitly rather than assumed.

## 10. Day of surgery

This is the hour where software either disappears or gets in the way. Every screen in this section is used standing, often gloved, with a sedated patient in the room.

### Check-in

Confirm identity with two identifiers. Verify demographics and insurance against what is on file, capture any change. Confirm escort present and get their phone number. Collect the patient portion. Capture any outstanding consent. Confirm NPO compliance and prep completion.

Offer self check-in on a tablet or the patient's phone for everything except identity verification and escort confirmation, which a human does. eCW's ASC offering lets patients check in, pay copays and answer questionnaires before they arrive, and that is the right target.

### Pre-op bay

Nursing assessment and vitals including height, weight, temperature, blood pressure, pulse, respiratory rate and oxygen saturation. IV placement with site and gauge. Medication reconciliation. Pregnancy test where indicated. Allergy band and site marking where applicable. Belongings. Pre-procedure H&P update signed by the physician.

Vitals should come from connected monitors where the equipment supports it rather than being keyed. eCW integrates continuous vital-signs devices for this reason; specify the device interface in section 19.

### Timeout

A structured, mandatory pause before sedation, recorded as a discrete event with its own timestamp and the names of everyone present. It confirms: correct patient, correct procedure, correct site and laterality where applicable, consent verified, allergies reviewed, required equipment present and functioning, antibiotic prophylaxis if indicated, and anticipated issues raised by any team member.

The timeout record is examined in every accreditation survey. It must be a first-class object, not a checkbox on the procedure note.

### Intra-procedure

The circulator records, with timestamps: room-in, sedation start, scope-in, cecal intubation or equivalent landmark, scope-out, room-out. Scope serial number and reprocessing cycle identifier. Medications administered with dose, route, time and administering clinician. Supplies and accessories used. Specimens as they are collected. Any complication or unplanned event.

The cecal intubation and withdrawal timestamps are not administrative detail. Cecal intubation rate and withdrawal time are reportable GI quality measures, and withdrawal time correlates with adenoma detection. Capture them precisely and expose withdrawal time live to the physician during the case.

Sedation monitoring is continuous: vitals at a defined interval throughout, recorded automatically from the monitor where interfaced.

### PACU

Arrival vitals, then at the protocol interval. A recovery score — Aldrete or the center's chosen equivalent — at defined intervals. Pain assessment and any medication given. Nausea. Tolerance of fluids. Ambulation. Voiding where required.

Discharge criteria must be explicit, scored, and met before discharge is permitted. The system must not allow a discharge to be recorded while a criterion is unmet without a physician override that is logged.

### Discharge

Final vitals. Discharge criteria met, with the score. Procedure-specific written instructions including diet, activity, medication restart (anticoagulation restart timing in particular), and warning signs with a number to call. Pathology expectations and how results will be communicated. Follow-up appointment or recall interval. Escort identity confirmed again at the door. Prescriptions sent.

Instructions are given in the patient's language and acknowledged. Record who received them — the patient after sedation often does not retain them, which is why the escort matters.

### Day-of exceptions

The system must handle, as first-class flows rather than as edge cases: case cancelled after arrival but before sedation; case aborted after sedation started; procedure converted or extended beyond what was consented; patient transferred to the hospital; and a complication requiring intervention. Each has distinct documentation, billing and quality-reporting consequences, and each must produce the right downstream effects automatically.

## 11. Clinical documentation

The procedure note is the legal record, the source of the codes, and the thing the referring physician reads. It must be complete, fast to produce, and never auto-signed.

### Required elements of a GI procedure note

| Element | Notes |
| --- | --- |
| Indication | Drives screening vs diagnostic determination |
| Consent confirmation | Procedure and physician named |
| Sedation | Agent, doses, administering clinician, monitoring |
| Scope | Type and serial number |
| Extent reached | Cecum, terminal ileum, duodenum — with photographic evidence of landmarks |
| Prep quality | Boston Bowel Prep Scale per segment for colonoscopy |
| Withdrawal time | Colonoscopy, measured from cecum to scope-out |
| Findings | Each with location, size in mm, morphology (Paris classification), and action taken |
| Interventions | Technique for each — cold snare, hot snare, EMR, biopsy, clip, injection, APC, dilation with size |
| Specimens | Container label, contents, source finding |
| Complications | Explicitly stated, including "none" |
| Estimated blood loss | Where relevant |
| Impression | Narrative summary |
| Recommendations | Including surveillance interval and who will communicate pathology |

Findings must be discrete structured objects, not prose. Coding, pathology reconciliation, surveillance interval calculation and adenoma detection rate all read from them. A note that records "several polyps removed" is unbillable at the correct level and unmeasurable for quality.

### Ambient capture

The physician speaks during the case and the system drafts. This is the headline feature and it is also the one with the most ways to go wrong.

Requirements:

1. Capture is continuous during the case and clearly indicated in the room. Record that capture occurred on the case.
2. The draft note is produced from the transcript plus the structured events the circulator logged. Transcript alone is insufficient; the timestamps and specimen labels are authoritative.
3. Every drafted element is attributable: the physician can see which utterance or logged event produced it.
4. Nothing drafted is final. The note enters a draft state, the physician reviews, edits and signs. There is no auto-sign under any configuration.
5. Where the model is uncertain about a clinically material value — a polyp size, an anatomical location, whether a specimen was retrieved — it must leave the field empty and flag it, never guess. A wrong size changes the surveillance interval and the code.
6. The raw transcript is retained with the same protections as the rest of the record and is discoverable. Decide retention policy deliberately. **OPEN**

### Photo capture

Images from the scope tower attach to the case and, where possible, to the specific finding. Landmark photographs — cecum, appendiceal orifice, ileocecal valve, retroflexion in the rectum — are required evidence of a complete examination and must be explicitly labelled, not left as an undifferentiated image set.

### Nursing documentation

Pre-op assessment, intra-op circulator record, PACU record and discharge record, each timestamped and attributed. These are separate documents with separate signatures; they are not sections of the physician's note.

### Anaesthesia record

Pre-anaesthesia assessment, intra-procedure record with vitals at the monitoring interval and all medications, and post-anaesthesia evaluation. Signed by the anaesthesia provider.

### Signature and amendment

All documentation requires electronic signature with the signer's identity, credential and timestamp. Signed documents are immutable. An amendment is a new, signed document that references the original and states what changed and why. The original text remains visible. This is an audit requirement and a medico-legal one, and retrofitting it is painful, so build it into the document model from the start.

## 12. Specimens and pathology

A GI ASC generates specimens on a large fraction of cases, and the loop from specimen to pathology result to patient notification to surveillance interval is the one most likely to fail silently. A lost result is a patient harm event and a malpractice exposure.

### Specimen capture

At collection the circulator records: container label (A, B, C in order), the finding it came from, anatomical site, number of fragments, fixative, and the collection timestamp. Labels print at the point of collection with patient identifiers, the label letter, site and collection time.

The specimen count on the note must equal the container count leaving the room. The system must reconcile them before the case closes and block closure on a mismatch.

### Requisition

Generate the pathology requisition containing patient demographics, ordering physician, clinical history and indication, each specimen with its site and the finding description, and the relevant ICD-10 codes. Transmit electronically where the lab supports it, print where not.

### Chain of custody

Record every handoff: collected in room, received by processing, logged into the courier manifest, courier pickup time, lab receipt confirmation. Each step with a timestamp and a person. A specimen with no lab receipt confirmation within a configurable window — typically 24 hours — raises an alert.

### Result receipt and reconciliation

Results arrive as HL7 v2 ORU messages from the lab, or as PDF when the lab cannot interface. Either way:

1. The result must match to a case and to the specific specimen by container label. An unmatched result goes to a human queue immediately, never to an unreviewed pile.
2. Every specimen sent must have a result received. The system maintains an open-specimen register and escalates anything outstanding past the expected turnaround — typically five business days — to the physician and the administrator.
3. The physician must acknowledge each result. Acknowledgement is an explicit action with a timestamp, not an implied one from opening the chart.
4. Malignancy, high-grade dysplasia and any unexpected diagnosis must be flagged on arrival and routed to the physician within the hour, with escalation if unacknowledged.

### Patient notification

Every result must be communicated to the patient, and the communication recorded: channel, date, who did it, and what was said. Normal results may go by portal or letter on a standard template. Abnormal results require a phone call by a clinician, and the system must track outstanding calls as work items until completed.

**OPEN** — what the center's result-communication policy will be, specifically the window for normal and abnormal results and who makes abnormal calls. Required before build; it determines the escalation timers.

### Feeding surveillance

The pathology result plus the procedure findings determine the surveillance interval (section 17). The system computes a recommendation from the current guideline table and presents it to the physician for confirmation. It never sets the interval autonomously.

### The closed loop

The system must be able to answer, at any moment, for every specimen in the last two years: was it collected, was it received by the lab, did a result come back, did the physician acknowledge it, was the patient told, and was a surveillance interval set. Any specimen failing any step appears on a daily exception report. Build this report before go-live, not after the first miss.

## 13. Supplies, scopes and inventory

Inventory management tracking is a named feature of the eCW ASC module and centers cite it as a reason for choosing it. For a GI center the three things that matter are accessory consumption, scope availability and reprocessing compliance.

### Item master

Each item: description, manufacturer, catalog number, unit of measure, vendor, cost, whether it is billable separately, par level, reorder point, storage location, and whether it is lot- or serial-tracked. Implantables and anything with a lot number and expiry must be tracked individually.

### Usage capture

Usage is captured in the room, against the case. Two mechanisms:

1. **Preference card default** — the card's items are presumed used and presented pre-filled. The circulator confirms or adjusts. This is fast and accurate enough for routine consumables.
2. **Scan** — barcode scan for anything lot-tracked, high-cost or implantable. Never presumed.

Usage decrements inventory, feeds cost-per-case reporting, and populates the billing record for separately billable supplies.

### Scopes

Scopes are the constraining asset. Track each scope individually: model, serial number, purchase date, current status (available, in use, in reprocessing, in repair, quarantined), total procedure count, and full reprocessing history.

Every case records the scope serial used. This creates the trace required if an infection cluster is ever investigated — the question "which patients had scope 4471 between these dates" must be answerable in seconds.

### Reprocessing

Each reprocessing cycle records: scope serial, cycle identifier, reprocessor machine, operator, start and end time, chemical lot, leak test result, and outcome. A scope cannot be assigned to a case unless its most recent cycle completed successfully and it is within the hang-time limit.

This is a hard gate, not a warning. A patient scoped with an inadequately reprocessed endoscope is a reportable event, and the system must make it impossible to do by accident.

### Par levels and reordering

Track on-hand quantity by location. Generate reorder suggestions when stock falls below the reorder point, sized to bring it back to par and accounting for the next two weeks' scheduled case mix. Flag expiring lots at 90 and 30 days.

### Cost per case

Roll usage plus staff time plus anaesthesia into a cost per case, by procedure and by physician. This is the number that tells the center whether its case mix is profitable and where preference cards have drifted. Report it monthly.

### Relationship to the existing procurement app

A separate procurement and equipment app is already being built for the center's construction and equipment phase, covering photo-capture of equipment records, maintenance, warranties and insurance. Decide now whether that app's equipment register becomes the source of truth for capital equipment while ASC OS owns consumables and scopes, or whether the two merge. **OPEN** — two inventory systems that both think they own scopes is a predictable failure; resolve the boundary before either ships.

## 14. Coding and charge capture

GI endoscopy coding has rules that no general-purpose coding engine handles well. This section is where domain knowledge becomes revenue, and it is the module most worth building carefully.

### Source of truth

Codes derive from the signed procedure note and its structured findings, never from the scheduled procedure. A case scheduled as a screening colonoscopy that found and removed a polyp is coded as a polypectomy.

### The screening-to-diagnostic conversion

The defining GI coding problem. A colonoscopy begun as screening that becomes therapeutic is still, for coverage purposes, a screening colonoscopy — but it must be coded to reflect the therapeutic work while preserving the patient's screening benefit.

The system must determine, for each case:

1. Was the indication screening or diagnostic at the outset? This comes from the referral and the documented indication, not from the CPT code.
2. Did an intervention occur?
3. Which payer type? Medicare uses modifier PT for a screening test converted to a diagnostic or therapeutic service; commercial payers generally use modifier 33 for preventive services. Getting this backwards costs the patient money they should not owe and generates an appeal.

Build this as an explicit rule set with the payer dimension, reviewed by the physician and a certified coder before go-live.

### Multiple endoscopy rules

When several endoscopic procedures are performed in the same session, Medicare's multiple endoscopy rule applies within an endoscopic family: the highest-valued procedure pays in full, and each additional procedure in the same family pays its value minus the value of the base endoscopy.

The system must know the endoscopic families, identify which performed procedures fall in the same family, apply the correct sequencing, and apply modifier 51 or the payer's equivalent. It must also know when procedures are in *different* families, where the rule does not apply.

Separately, when the same procedure is performed at distinct anatomical sites — a snare polypectomy in the sigmoid and a cold biopsy in the ascending colon — modifier 59 or the appropriate X-modifier applies to signal a distinct procedural service. The structured findings carry the anatomical locations, which is precisely why findings must be discrete objects.

### Facility vs professional

The ASC bills the facility claim. The physician bills professionally, usually under a separate entity. The system must generate both charge sets, keep them distinct, and know that the ASC claim uses the ASC payment system (covered-procedures list and payment indicators) while the professional claim uses the physician fee schedule.

**OPEN** — will ASC OS produce the professional claim too, or only the facility claim? This determines whether a second billing entity, fee schedule and clearinghouse submitter ID are needed.

### Diagnosis coding

ICD-10-CM from the documented indication and the findings. Screening Z-codes where applicable, family history codes, and the findings-based codes. Order matters: the primary diagnosis drives medical necessity, and for a screening case the screening code is primary even when a polyp is found.

### Supplies and anaesthesia

Separately billable supplies per the payer's rules. Anaesthesia is typically billed by the anaesthesia group under its own claim; the system must still record the anaesthesia time units and provide them to that group.

### The physician review gate

The system suggests codes with rationale and a pointer to the documentation supporting each. The physician or a certified coder must approve before the claim is built. This is a hard gate.

The rationale requirement is not cosmetic. When a payer audits, the center must show why each code was assigned, and a suggestion with no traceable basis is indefensible. Every suggested code carries: the code, the modifier set, the finding or note passage supporting it, the rule applied, and a confidence level.

No code is ever submitted on a model's confidence alone.

## 15. Claims, remittance and patient billing

### Claim construction

Build the facility claim as X12 837I or 837P depending on payer requirement, carrying: facility NPI and tax ID, patient and subscriber demographics, coverage details, place of service 24, procedure codes with modifiers and units, diagnosis codes in the correct order, the authorization number where one exists, charges, and the rendering and referring provider identifiers.

Run a scrub before submission. At minimum: required fields present, code and modifier combinations valid, diagnosis supports the procedure, authorization present where required and valid on the service date, patient demographics match the eligibility response, and the service date falls inside the coverage period. A claim failing the scrub becomes a work item, never an auto-submission.

### Submission and acknowledgement

Submit through the clearinghouse. Process the acknowledgement chain properly — this is where most homegrown billing modules are thin:

| Transaction | What it means | Required handling |
| --- | --- | --- |
| 999 | Clearinghouse accepted or rejected the file syntax | A rejected file means nothing was submitted; alert immediately |
| 277CA | Payer-level claim acknowledgement | Claim accepted into adjudication, or rejected before adjudication |
| 835 | Remittance advice | Payment, adjustments, denials |

A claim that never produces a 277CA is lost, and nobody notices for 45 days unless the system is watching. Track every claim's expected acknowledgement and escalate silence.

### Remittance posting

Parse the 835 and post automatically: payment amount, contractual adjustment, patient responsibility split into deductible, coinsurance and copay, and any denial with its CARC and RARC codes. Reconcile against the expected allowed amount from the contract and flag underpayments.

Underpayment detection matters. Payers pay below contract routinely, and a center with no systematic comparison simply absorbs it.

### Denials

Every denial becomes a work item with its reason code, categorized into an actionable taxonomy: eligibility, authorization, medical necessity, coding, timely filing, duplicate, coordination of benefits, bundling. Each category has a defined work path.

Track appeal deadlines per payer and escalate ahead of them. A denial that ages past the appeal window is an unforced loss.

Feed denial patterns back upstream. If authorization denials cluster on one payer and procedure, the payer configuration matrix in section 4 is wrong, and the system should say so rather than waiting for a human to notice.

### Secondary and patient billing

Auto-generate secondary claims after primary adjudication where secondary coverage exists. Generate patient statements for the remaining balance with a clear itemization — patients understand "colonoscopy, your deductible" and do not understand a CPT code.

Support online payment, payment plans, and a defined collections path. Hold statements while an appeal is in progress; billing a patient for an amount under appeal is both wrong and a guaranteed complaint.

### Reporting

Daily: charges entered, claims submitted, cash posted, denials received. Monthly: days in AR, clean claim rate, first-pass resolution rate, denial rate by category and payer, net collection rate, AR aging buckets. These are the standard RCM measures and the administrator will be asked for them by the center's partners.

## 16. Quality reporting and QAPI

Quality data is a byproduct of the operational timestamps and structured findings already specified. If sections 5, 10 and 11 are built correctly, this section is mostly reporting. If they are not, it is manual chart abstraction forever.

### ASCQR

The Medicare ASC Quality Reporting program determines part of the center's payment update. Measures are a mix of claims-based, web-submitted and survey-based, and the exact set changes by program year, so the measure definitions must be configuration, not code.

The recurring categories a GI ASC must capture:

| Category | Captured from |
| --- | --- |
| Patient falls and burns | Incident reporting |
| Wrong site, side, patient, procedure or implant | Incident reporting and timeout record |
| Hospital transfer or admission | Day-of exception flow (section 10) |
| Unplanned anterior vitrectomy | Not applicable to GI |
| Normothermia and prophylactic antibiotic timing | Intra-op record where applicable |
| Facility volume by procedure category | Case data |
| COVID and influenza vaccination of healthcare personnel | Credentialing module |
| Patient experience survey (OAS CAHPS) | External vendor |

**OPEN** — confirm the current program-year measure set with the center's billing or compliance advisor before build. Treat anything here as a starting list, not the final one.

### GI-specific quality measures

These are not all ASCQR measures but they are what a GI center is judged on clinically and what payers increasingly ask for:

1. **Adenoma detection rate** — proportion of screening colonoscopies in patients 45 and over in which at least one adenoma was found, calculated per physician. Requires pathology results linked to findings, which is why section 12's loop must close.
2. **Cecal intubation rate** — with photographic documentation of landmarks.
3. **Withdrawal time** — mean, and proportion of negative screening colonoscopies with withdrawal time of six minutes or more.
4. **Adequate bowel preparation rate** — proportion with Boston score indicating adequate prep.
5. **Appropriate surveillance interval recommendation** — proportion where the documented interval matches guideline for the findings.
6. **Complication rates** — perforation, post-polypectomy bleeding, unplanned hospital transfer, within defined windows.

Every one of these is computable from the structured data this document already requires. Expose them as a per-physician dashboard, refreshed nightly.

### Incident reporting

A structured incident report covering: date and time, case if applicable, incident type, people involved, description, immediate action, harm level, and whether the event is state-reportable. Florida has specific adverse-incident reporting requirements with defined timelines; the system must flag reportable events and track the submission deadline.

Incidents feed QAPI and must never be deletable.

### QAPI

The accreditor requires a documented, ongoing quality assessment and performance improvement program. The system must support: defining a measure and its target, tracking it over time, recording a performance improvement project with its aim, interventions and results, meeting minutes with attendance, and evidence of the loop closing.

This is the folder the surveyor asks for first. Build it as a real module, not a place to upload PDFs.

### Operational reporting

First-case on-time start rate, turnover time by room, block utilization, case cancellation rate by reason, same-day cancellation rate, PACU length of stay, and schedule accuracy (scheduled vs actual duration by physician and procedure). These are management tools and they come free from the stage timestamps.

## 17. Surveillance recall

For a GI center, recall is not a nice-to-have. A screening colonoscopy generates a return visit in three, five, seven or ten years, and the center that tracks those owns a predictable pipeline. The center that does not loses the patient back to whoever does.

### Interval determination

At case close the system computes a recommended surveillance interval from the findings and the pathology, using a versioned guideline table. The inputs are the number of adenomas, their size, histology including villous features and high-grade dysplasia, whether removal was piecemeal, whether sessile serrated lesions were found, prep adequacy, whether the examination was complete to the cecum, and family history.

The guideline table is configuration with an effective date and a citation, reviewed and approved by the physician. When guidelines change, old recommendations stand as made and new cases use the new table. Record which version produced each recommendation.

Three rules:

1. The recommendation is presented to the physician, who confirms or overrides. Never set autonomously.
2. An override records a reason. Over-short and over-long intervals both matter clinically and both get reviewed in QAPI.
3. An inadequate prep or incomplete examination overrides the findings-based interval with an early repeat. The system must apply this before the findings logic, not after.

### The recall register

Every patient with a confirmed interval enters the recall register with the due date, the indication, the physician, and the finding that drove it. The register is queryable and must survive everything — it is the center's most valuable long-term asset.

### Outreach

Outreach begins ahead of the due date on a configurable ladder: a first contact at 90 days before, a second at 30 days, a third at due, then at 30, 90 and 180 days overdue. Channel follows the patient's stated preference, escalating from message to letter to phone call.

Each attempt is recorded with channel, date, outcome and any patient response. A patient who declines must be recorded as declining, with the date, and removed from active outreach while remaining in the register.

### Reporting

The administrator needs: patients due in the next 90 days, patients overdue by bucket, conversion rate from outreach to scheduled case by channel, and recall volume projected 12 months out for capacity planning.

### Pathology-driven recall

A pathology result that changes the picture after the physician has already set an interval — an unexpected high-grade dysplasia, a sessile serrated lesion read differently than the endoscopic impression — must reopen the interval decision as a work item for the physician, not silently adjust it. This is the specific failure mode that produces late cancer diagnoses, and it is worth engineering carefully.

## 18. The AI agent layer

ASC OS is AI-native, which means agents do work rather than suggest it. This section defines where that is allowed and where it is not. Read it before building anything in sections 6, 8, 11 or 14.

### The governing principle

**Agents may prepare any state change. Only a human may commit one that affects clinical care, patient finances, or the legal record.**

Preparation is unlimited: gathering, extracting, drafting, calling, calculating, assembling, submitting inquiries. Commitment is gated. The boundary is not negotiable per customer or configurable in settings.

### What runs autonomously

| Agent | Work | Commits without a human? |
| --- | --- | --- |
| Intake | Classify inbound documents, extract fields, propose patient match | No — match confirmed by human |
| Eligibility | Submit 270, parse 271, update coverage | Yes, for a clean confirmed response |
| Benefits | Parse benefit detail, compute estimate | Yes, computation; No, communication to patient |
| Authorization | Determine requirement, assemble packet, submit, follow up | Yes for submission; No for accepting a denial |
| Outreach | Confirmation calls and messages, prep reminders, recall contact | Yes |
| Scribe | Draft the procedure note from ambient capture and logged events | No — physician signs |
| Coding | Suggest codes with rationale | No — physician or coder approves |
| Claim | Scrub, build, submit, post remittance | Yes, after code approval |
| Denial | Categorize, draft appeal, gather documentation | No — human submits appeal |
| Specimen watch | Track open specimens, escalate overdue | Yes, escalation only |

### What is never autonomous

1. Signing or attesting to any clinical document.
2. Approving codes for submission.
3. Setting a surveillance interval.
4. Accepting a coverage denial or a payer determination.
5. Waiving a readiness check.
6. Communicating an abnormal clinical result to a patient.
7. Advising a patient to stop, start or change a medication.
8. Writing off, discounting, or sending to collections.
9. Merging patient records.
10. Any transition through a hard gate in section 5.

### Confidence and abstention

Every agent output carries a confidence. Below a per-task threshold the agent must abstain and create a work item rather than produce a low-confidence answer. Abstention is a success, not a failure, and the metrics must treat it that way.

The failure mode to design against is confident wrongness on degraded input — a payer response that is silent rather than negative, a transcript that garbled a polyp size, a referral whose insurance card scanned badly. In each case the correct behaviour is to produce nothing and ask. Build the evaluation harness around exactly these cases, not around the clean ones.

### Auditability

Every agent action writes an audit record with the same structure as a human action: actor (the agent and its version), timestamp, what changed, and the inputs it acted on. The model version and prompt version are part of the record.

An administrator must be able to answer "why does this case say the authorization is not required" and get back the payer rule, the agent, the version and the timestamp.

### Human in the loop, in practice

The review surface matters as much as the gate. A physician approving twelve code sets at the end of a block will rubber-stamp them if the UI makes that the path of least resistance. Design the approval screens to surface only what needs judgment and to make disagreement as cheap as agreement. Section 14's rationale requirement exists for this reason.

### Safety review before go-live

Before any agent runs against real patients, each one needs a written evaluation: what it does, the failure modes, the test set, measured accuracy and abstention rate, and the human control. Keep these in the QAPI folder — the accreditor will eventually ask, and the center's malpractice carrier may ask sooner.

## 19. Integrations and interfaces

Every item here has an external dependency with its own lead time. Several take weeks that cannot be compressed, so contracting must start before the code does.

| Interface | Protocol | Vendor dependency | Lead time | Phase |
| --- | --- | --- | --- | --- |
| Clearinghouse — eligibility, claims, remittance | X12 270/271, 278, 837, 277CA, 835 | Clearinghouse contract and enrolment per payer | 4–8 weeks | Launch |
| Pathology lab | HL7 v2 ORU in, ORM out; MLLP over VPN | Lab's interface team | 4–12 weeks | Launch |
| Inbound fax | eFax provider API | Number porting or new number | 1–2 weeks | Launch |
| e-Prescribing | Surescripts via DoseSpot or ScriptSure | EPCS identity proofing per prescriber | 4–8 weeks | Launch |
| Card payments | Payment processor, point-to-point encrypted terminal | Merchant account | 2–4 weeks | Launch |
| SMS and voice outreach | Telephony provider | 10DLC registration for SMS | 2–4 weeks | Launch |
| Patient portal | Own build | — | — | Launch |
| Vital signs monitors | Device gateway, HL7 or vendor SDK | Monitor model dependent | Varies | Phase 2 |
| Scope tower image capture | DICOM or vendor capture | Tower model dependent | Varies | Phase 2 |
| Referring provider exchange | Direct messaging, C-CDA | HISP account | 4–6 weeks | Phase 2 |
| Anaesthesia group billing | Flat file or API | Group's system | — | Phase 2 |
| Accounting | Export to the center's GL | — | — | Phase 2 |

### Payer enrolment

The item most often underestimated. Each payer requires separate EDI enrolment for claims, remittance and eligibility, and each takes its own time — typically two to six weeks, occasionally longer for Medicare. Enrolment cannot begin until the facility has its NPI, tax ID and CMS certification number. This is on the critical path for the center's first paid claim, and it is an administrative task, not an engineering one. Start it now.

### Pathology lab interface

The interface that most directly affects patient safety. Decide the lab early, get their interface specification, and build to it. If the lab cannot interface before go-live, the fallback is PDF results into the incoming-items queue with manual matching — workable, but the open-specimen register in section 12 becomes essential rather than merely good practice.

### Interface engine

HL7 v2 over MLLP needs a listener with durable queuing, acknowledgement handling and replay. Do not write this from scratch and do not run it inside the application process. Use an interface engine, run it as a separate deployable, and give it its own monitoring.

### Failure handling

Every interface must define: what happens when the remote end is unreachable, how long messages queue, when a human is alerted, and what the manual fallback is. Write the fallback down for each one before go-live. A pathology interface that silently drops a result for three days is worse than no interface, because staff stop watching the fax.

## 20. Non-functional requirements

### Availability

The center operates roughly 7 a.m. to 3 p.m. on weekdays. During those hours the system is life-critical in the practical sense: an outage stops procedures on sedated patients.

| Requirement | Target |
| --- | --- |
| Availability during operating hours | 99.9% |
| Planned maintenance | Outside operating hours only, announced 72 hours ahead |
| Recovery time objective | 1 hour |
| Recovery point objective | 5 minutes |
| On-call coverage | A named engineer reachable during all operating hours |

The on-call requirement is not optional and it is not satisfied by "someone will see the alert." Before go-live there must be a rota, a phone number the center's administrator can call, and an agreed response time.

### Performance

| Action | Target |
| --- | --- |
| Any screen load | Under 1 second at p95 |
| Save of a clinical action in the room | Under 500 ms at p95 |
| Case list and schedule render | Under 1 second with a full day loaded |
| Document upload and extraction | Under 60 seconds end to end |
| Ambient draft available after case end | Under 2 minutes |

In-room actions are the strict ones. A nurse waiting on a spinner with a sedated patient will stop using the system and write on paper.

### Security

Encryption in transit (TLS 1.3) and at rest. Unique user identification with no shared accounts, ever. Multi-factor authentication for all users; support a fast re-entry mechanism on clinical workstations that does not become a shared PIN. Automatic session termination. Role-based access as section 3. Key management through the cloud provider's KMS. Annual security risk analysis as HIPAA requires, documented.

All PHI stays within the BAA-covered infrastructure. Any model inference touching PHI runs under a BAA with that provider. No PHI in logs, no PHI in error messages, no PHI in URLs, no PHI in analytics.

### Audit logging

Every access to PHI is logged: who, what record, when, from where, and what action. Logs are append-only, retained six years, and queryable by patient and by user. The administrator must be able to produce an access report for a single patient on request, which patients have a right to ask for.

### Backup and disaster recovery

Automated encrypted backups with point-in-time recovery. Restore tested quarterly — an untested backup is a hypothesis. Geographic redundancy. A written disaster recovery plan the administrator can execute.

### Devices and browsers

Desktop workstations in pre-op, PACU and the business office. Wall-mounted or cart displays in procedure rooms. Tablets for mobile staff. Phones for patient-facing flows. Support current Chrome, Edge and Safari. Design for gloved hands and dim rooms in clinical areas: large targets, high contrast, no hover-dependent interactions.

### Accessibility

WCAG 2.1 AA for patient-facing surfaces. Patient materials available in Spanish at minimum, given the center's location.

### Observability

Structured logging, error tracking, uptime monitoring with alerting to the on-call engineer, and a status page the administrator can check. Monitor interface queues explicitly — a stalled HL7 listener must page someone, not sit silently.

## 21. Go-live, downtime and migration

### Migration

There is no legacy EHR, which removes the hardest part of most go-lives. What must still be loaded before day one: the full configuration set from section 4, staff accounts and credentials, payer enrolments, and the first two weeks of scheduled cases with their referrals and financial clearance already complete.

That last item matters. The first patients should be booked and cleared in the system weeks before they arrive, not registered at the door on opening morning.

### Phasing

Do not go live with everything. A workable order:

| Phase | Scope | Timing |
| --- | --- | --- |
| 1 | Configuration, scheduling, registration, referral intake | 6 weeks before opening |
| 2 | Financial clearance, pre-op workflow | 4 weeks before |
| 3 | Day-of flow, clinical documentation, specimens | 2 weeks before, exercised in dry runs |
| 4 | Coding, claims, remittance | Opening week — first claims go out within 7 days, not 30 |
| 5 | Quality, QAPI, recall | Within 30 days of opening |

Ambient documentation is deliberately not in phase 3's critical path. Ship structured documentation that works, then layer ambient capture on top once the center is running. If ambient is not ready, the physician types; if structured documentation is not ready, the center cannot operate.

### Dry runs

Three full mock days before opening, with real staff, synthetic patients, and every step performed as it will be on the day: check-in through discharge through claim. Each dry run produces a defect list and the next one re-tests it. The third must run clean.

Invite the accreditor's requirements into the dry run — produce the records a surveyor would ask for and confirm they exist.

### Downtime procedures

Write these before go-live and print them. The center must be able to operate for four hours without the system.

1. **Downtime pack** — a printed next-day schedule with patient identifiers, allergies, procedures and physicians, regenerated automatically every evening and kept in a known physical location.
2. **Paper forms** — pre-op assessment, procedure note, nursing record, discharge instructions. Printed, stocked, and known to staff.
3. **Declaration and communication** — who declares downtime, who tells the staff, who calls the engineer.
4. **Recovery** — paper records are scanned and entered within 24 hours, flagged as retrospective entries with the actual time of care recorded separately from the time of entry.

Test the downtime procedure during one dry run. A plan nobody has rehearsed is not a plan.

### Training

Role-specific, hands-on, in the real environment with synthetic data. Every user completes training before go-live and training completion is recorded, because the accreditor will ask. Identify a superuser in each area who gets deeper training and becomes the first line of support.

### Support model

For the first two weeks: on-site or immediately available support during all operating hours. After that: a named contact, a defined response time by severity, and a logged ticket queue. Define severity levels now, with "procedures are stopped" as severity one and a response time measured in minutes.

### Go-live decision

Set the criteria in advance and in writing: which phases are complete, which dry run passed, which interfaces are live, which payer enrolments are approved, downtime pack tested, staff trained. Agree with Dr. Ramesh what happens if criteria are unmet — delay, or open with a defined manual fallback for the gap. Making that decision now, calmly, is far better than making it the week before opening.

## 22. Out of scope, phase 2, and open questions

### Explicitly out of scope

Not built, not planned, and the center must have another answer for each:

| Function | Where it goes instead |
| --- | --- |
| Payroll and HR | Separate system |
| General ledger and accounting | Separate system; ASC OS exports to it |
| Anaesthesia group's own billing | Their system; ASC OS supplies time units |
| Patient experience survey (OAS CAHPS) | Approved external vendor; required for ASCQR |
| Credentialing verification services | Primary source verification is a manual or vendor process |
| Pharmacy inventory for controlled substances | May need a separate controlled-substance log; confirm state requirement |
| Office clinic EHR | Only if the OPEN question in section 7 resolves to yes |

### Phase 2

Patient self-scheduling. Referring-provider portal and status visibility. Device integration for vital signs and scope images. Direct messaging and C-CDA exchange. Multi-facility support. Advanced analytics and benchmarking. Patient mobile app.

Multi-facility is worth flagging. The data model should carry a facility identifier on every record from day one even though only one facility exists, because retrofitting tenancy is expensive and the center may add a second room block or a second site.

### Open questions

These block specific modules. Each needs an answer from Anurag or Dr. Ramesh before the module is built.

| # | Question | Blocks | Needed by |
| --- | --- | --- | --- |
| 1 | Which accreditor — AAAHC, ACHC or Joint Commission? | Section 16 measure set, documentation detail | Before section 16 |
| 2 | Is the AMA CPT licence in hand? | Any coding feature | Before section 14 |
| 3 | Will the center run a parallel office clinic? | Scheduling model, patient record scope | Before section 7 |
| 4 | Does ASC OS produce the professional claim or only the facility claim? | Billing entity setup, fee schedules | Before section 15 |
| 5 | Which pathology lab, and can they interface before go-live? | Section 12 and 19 | Immediately — longest lead time |
| 6 | Which clearinghouse? | Payer enrolment, which cannot start without it | Immediately |
| 7 | What is the result-communication policy — windows and who calls? | Section 12 escalation timers | Before section 12 |
| 8 | Ambient transcript retention policy | Section 11 | Before ambient ships |
| 9 | Will race, ethnicity and language be collected? | Section 6 registration | Before section 6 |
| 10 | Where does the procurement app's equipment register end and ASC OS inventory begin? | Section 13 | Before either ships |
| 11 | Who is the named on-call engineer during operating hours? | Section 20 — a go-live blocker, not a technical question | Before go-live |
| 12 | What is the commercial relationship — is ASC OS licensed to this facility, built under contract, or a product this is the first installation of? | Tenancy model, IP terms, support obligations | Before build continues |

Question 12 is not an engineering question but it changes engineering decisions. A single-facility custom build and a product with its first customer have different tenancy, configuration and support requirements, and the data model choices differ. Resolve it early.

### Document status

This is a first draft written from the eCW ASC module as a functional baseline plus GI ASC domain requirements. It has not been reviewed by a practising ASC administrator, a certified coder, or the center's compliance advisor. Sections 2, 14 and 16 in particular carry regulatory and coding detail that should be validated by someone with current credentials before anything is built on them.
