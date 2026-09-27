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
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q4 | Clearinghouse (Stedi/Candid) | real eligibility | Stub + manual verification checkbox |
| Q1 | Import referrals' eCW patient ID at registration? | T1 | Optional identifier field (06 §5.1) |
