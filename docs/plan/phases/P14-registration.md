# P14 — Registration, patient search, eligibility stub

| Field | Value |
|---|---|
| Wave · Lane · Size | 3 · Clinical · M |
| Depends on | P05, P09 |
| Unblocks | P15 |
| Source mix | MP (`Patient`, `Coverage`, `RelatedPerson`, Binary card scans) + MS pattern (one patient per external ID) + NEW |
| Requirements | M02-1…M02-6 |
| Branch | `phase/P14-registration` |

## Goal
Front desk finds or registers a patient in < 1 min: search, duplicate warning, demographics, coverage + card images, escort/guarantor, referring NPI; eligibility check stubbed (Task on failure).

## Out of scope
Real 270/271 clearinghouse (needs Q4 + vendor), patient portal pre-registration (P2).

## File structure
```text
packages/validation/src/patients/{register,search,coverage}.ts   NEW
packages/clinical-rules/src/patients/duplicate-match.ts          NEW  deterministic rules (name+DOB+sex, identifiers) → score
packages/fhir/src/builders/{patient,coverage,related-person}.ts  EDIT
apps/api/src/routes/patients.ts                                  NEW  POST /patients/register (dup-check + transaction bundle)
apps/api/src/services/patient-register.ts                        NEW
apps/bots/src/eligibility-stub.ts                                NEW  Coverage created → fake 271 → Task on "inactive"
packages/ui/src/components/clinical/{patient-search,duplicate-warning,card-capture}.tsx  NEW
apps/web/src/app/(clinical)/patients/{page.tsx,new/page.tsx,[patientId]/page.tsx}         NEW
apps/web/src/features/patients/*                                 NEW  composition + hooks
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Schemas + builders | `@asc/validation`, `@asc/fhir` | contracts |
| T2 | Duplicate-match rules | `@asc/clinical-rules` | pure fn + golden tests |
| T3 | Register command + eligibility stub bot | `apps/api`, `apps/bots` | endpoint + bot |
| T4 | Search/duplicate/card components | `@asc/ui` | components |
| T5 | Patient pages | `apps/web` | flow works e2e |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | T2–T5 | — |
| T2 | T1 | T3 | T4 |
| T3 | T1, T2 | T5 | T4 |
| T4 | T1 | T5 | T2, T3 |
| T5 | T3, T4 | P15 | — |

## Packages to add
None.

## Acceptance
- [ ] Duplicate warning shown with reason; merge is Medplum `Patient.link` (admin only)
- [ ] Card images stored as Binary via Medplum, not in our DB
- [ ] No PHI in URLs (IDs only) or logs
- [ ] e2e: register → open patient
- [ ] Patients at more than one facility follow the tenant's `patientRecordSharing` setting ([#59](https://github.com/imRahul05/ASC-EHR/issues/59), decided 2026-10-09). A new Patient is created with its registering facility in `meta.accounts`. Registering an existing Patient at another facility adds that facility through `$set-accounts`, with the current accounts kept:
  - `on-encounter` (the default for one covered entity) uses `propagate: true`, so the new facility sees the full chart;
  - `isolated` (separate legal entities) adds the account without propagation.
- [ ] Every addition is audited as `patient.facility_added` (actor, facility, reason). Registration only adds accounts; removing one is an admin action with a reason, audited (test)
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q4 | Clearinghouse (Stedi/Candid) | real eligibility | Stub + manual verification checkbox |
| Q1 | Import referrals' eCW patient ID at registration? | T1 | Optional identifier field (06 §5.1) |

## P14 decisions (recorded 2026-10-13, PR #75 review)

1. **Sub-phase sizing (LM-015 / PROGRESS.md)**: Split P14 into:
   - **P14a**: Patient Intake Contracts, Duplicate Match Engine & Fastify API Routes (PR #75)
   - **P14b**: Eligibility Stub Bot, Clinical UI Components & Patient Web Pages
2. **PHI in URLs and Request Logging (COMPLIANCE_AND_PHI §4)**:
   - Patient search supports `POST /patients/search` with demographics passed in the JSON request body.
   - For defense-in-depth, Fastify's request serializer in `@asc/logger` sanitizes query parameters from `req.url`, ensuring query strings are never written to request logs.
3. **Exact Identifier (MRN) Duplicate vs Demographic Match**:
   - Matches with `exact_identifier` confidence (matching MRN within the facility) are non-waivable and unconditionally return HTTP 409 `duplicate_mrn_conflict`.
   - `confirmDuplicate: true` is honored only for high-confidence demographic overlaps (matching Name + DOB + Gender) to accommodate valid demographic collisions (e.g., parent/child with shared names).
4. **Boundary Validation of FHIR Identifiers (LM-017 / LM-021)**:
   - `facilityId` and `payerId` are validated at the Zod schema boundary against the canonical FHIR ID regex (`/^[A-Za-z0-9.-]{1,64}$/`) and `mrn` against bounded non-whitespace tokens to fail fast with HTTP 400 before reaching FHIR builders.
5. **Multi-Facility Account Scoping & $set-accounts (#59)**:
   - In P14a, duplicate candidate search is strictly scoped to the registering facility (`_account: Organization/${facilityId}`) to prevent cross-facility data leakage while preventing local facility duplicates.
   - Tenant-wide patient record sharing, `$set-accounts` with `propagate` settings, and `patient.facility_added` audit logging are scheduled for P14b intake orchestration.
6. **Address Sanitization**:
   - Empty address objects (all fields blank or undefined) are sanitized to `undefined` before building FHIR `Patient` resources to prevent invalid empty address entries (`[{}]`).
