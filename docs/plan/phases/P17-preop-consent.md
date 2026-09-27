# P17 — Pre-op nursing, time-out, consent + signature

| Field | Value |
|---|---|
| Wave · Lane · Size | 3 · Clinical · M |
| Depends on | P11, P15 |
| Unblocks | — (procedure start requires time-out) |
| Source mix | MP (`Consent`, `QuestionnaireResponse`, `Provenance`, Binary PDF) + MS (signed-record lock) + NEW |
| Requirements | M04-1…M04-6, M11-1…M11-4 |
| Branch | `phase/P17-preop-consent` |

## Goal
Pre-op RN records vitals/IV/NPO via forms; patient signs consent on tablet (signature image + PDF); multi-role time-out attestation transitions case to In-procedure.

## File structure
```text
packages/fhir/src/questionnaires/{preop-nursing,time-out,consent-colonoscopy,consent-egd}.ts NEW
packages/validation/src/consent.ts · time-out.ts                          NEW
packages/clinical-rules/src/gates/time-out.ts                             NEW  all roles attested
packages/ui/src/components/signature-pad/signature-pad.tsx                NEW
apps/api/src/routes/consent.ts · time-out.ts                              NEW  commands (Consent + Binary + Provenance; transition)
apps/worker/src/jobs/consent-pdf/*                                        NEW  render signed PDF
apps/web/src/app/(clinical)/cases/[caseId]/preop/page.tsx                 NEW
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Forms + schemas | `@asc/fhir`, `@asc/validation` | contracts |
| T2 | Time-out gate | `@asc/clinical-rules` | tests |
| T3 | Signature pad | `@asc/ui` | component |
| T4 | Consent/time-out commands + PDF job | `apps/api`, `apps/worker` | endpoints/job |
| T5 | Pre-op page | `apps/web` | flow |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | T2–T5 | — |
| T2 | T1 | T4 | T3 |
| T3 | — | T5 | T1, T2, T4 |
| T4 | T1, T2 | T5 | T3 |
| T5 | T3, T4 | — | — |

## Packages to add
| Package | Version | Workspace |
|---|---|---|
| `signature_pad` | 5.1.4 | `@asc/ui` |
| `@react-pdf/renderer` | 4.9.0 | `apps/worker` |

## Acceptance
- [ ] Case cannot enter In-procedure without consent + complete time-out
- [ ] Signed consent PDF stored as Binary + DocumentReference
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q1 | Consent templates (legal-approved text) | T1 | Placeholder text flagged "not for clinical use" |
| Q14 | Languages | T1 | English only P1 |
