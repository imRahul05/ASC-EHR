# P08 — Terminology + FSH profiles

| Field | Value |
|---|---|
| Wave · Lane · Size | 2 · Domain · M |
| Depends on | P02, P03 |
| Unblocks | P19, P22 |
| Source mix | MP (terminology service, `$validate`) + NEW (GI content) |
| Requirements | M05 GI content model; M09 codes; 02 §C terminology row |
| Branch | `phase/P08-terminology-profiles` |

## Goal
GI profiles (procedure, finding, specimen, anesthesia record) compiled from FSH and uploaded; ICD-10-CM + GI local code systems loaded; CPT loader ready behind a licence flag.

## Out of scope
Coding rules logic (P22); CPT data itself until Q8 answered.

## File structure
```text
packages/fhir/fsh/sushi-config.yaml                         NEW
packages/fhir/fsh/input/fsh/{procedure,finding,specimen,anesthesia}.fsh   NEW  Paris, size, segment, BBPS, withdrawal time
packages/fhir/src/terminology/codesystems/{gi-findings,colon-segments,paris,bbps,case-phase}.ts  NEW
packages/fhir/src/terminology/valuesets/*.ts                NEW
packages/fhir/src/profiles/index.ts                         NEW  generated StructureDefinitions (committed JSON) + TS helpers
apps/bots/scripts/upload-conformance.ts                     NEW  upload profiles, CodeSystems, ValueSets (idempotent)
apps/bots/scripts/load-icd10cm.ts                           NEW  public CMS files → CodeSystem
apps/bots/scripts/load-cpt.ts                               NEW  guarded by CPT_LICENSED flag in @asc/config
packages/config/src/flags.ts                                NEW  CPT_LICENSED, …
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | GI CodeSystems/ValueSets as TS data (with tests for code uniqueness) | `@asc/fhir` | terminology module |
| T2 | FSH profiles + sushi build script (`pnpm --filter @asc/fhir fsh`) | `@asc/fhir` | StructureDefinitions |
| T3 | Upload + ICD-10-CM loader scripts | `apps/bots` | scripts |
| T4 | CPT loader + flag | `apps/bots`, `@asc/config` | guarded loader |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | T3 | T2, T4 |
| T2 | — | T3, P19 | T1, T4 |
| T3 | T1, T2 | P19, P22 | T4 |
| T4 | — | P22 | T1–T3 |

## Packages to add
| Package | Version | Workspace |
|---|---|---|
| `fsh-sushi` | 3.20.1 | `@asc/fhir` (dev) |
| `@medplum/definitions` | 5.1.42 | `@asc/fhir` (dev, validation tests) |

## Acceptance
- [ ] Sample finding Observation validates via Medplum `$validate`
- [ ] Loader scripts idempotent
- [ ] No CPT descriptors in repo (licence)
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q8 | CPT licence holder | T4 data | Ship loader, no data |
| Q1 | MST (Minimal Standard Terminology) licensing/use | T1 | Local codes mapped to SNOMED where free |
| Q2 | Physician review of finding schema | T2 | Weekly review cycle (05 v1) |
