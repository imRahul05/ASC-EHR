# P03 — `@asc/fhir` package (types, identifiers, builders)

| Field | Value |
|---|---|
| Wave · Lane · Size | 1 · Domain · S |
| Depends on | — |
| Unblocks | P04, P07, P08, P11, P14 |
| Source mix | MP (fhirtypes) + NEW |
| Requirements | 03 §3 data model; multi-site readiness NFR |
| Branch | `phase/P03-fhir-package` |

## Goal
One isomorphic package that every workspace uses for FHIR types, our identifier systems, extension URLs, case-phase codes and typed resource builders — so no app hand-writes FHIR JSON.

## Out of scope
Network calls (P04), FSH profiles and terminology loads (P08), Questionnaires (P11).

## File structure
```text
packages/fhir/package.json            NEW  "@asc/fhir", exports "./src/index.ts" (JIT package)
packages/fhir/src/index.ts            NEW  re-export type * from "@medplum/fhirtypes" + our modules
packages/fhir/src/identifiers.ts      NEW  systems: urn:wybit:ecw:<practice> (06 §5.1), MRN, case number
packages/fhir/src/extensions.ts       NEW  case-phase, procedure intent, agentExecutionId URLs
packages/fhir/src/case-phase.ts       NEW  CasePhase codes (scheduled…closed) as const + CodeSystem JSON
packages/fhir/src/bundle.ts           NEW  transaction bundle helper (urn:uuid refs)
packages/fhir/src/builders/{patient,encounter,appointment,provenance,task}.ts  NEW
packages/fhir/src/__tests__/*.test.ts NEW
docs/agent/architecture.md            EDIT add @asc/fhir to package map
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Package scaffold (JIT exports, lint, tsconfig, vitest) | `@asc/fhir` | builds in consumers |
| T2 | Identifiers, extensions, case-phase codes | `@asc/fhir` | constants + tests |
| T3 | Builders (Encounter = case, Provenance with agentExecutionId, Task) + bundle helper | `@asc/fhir` | pure builders + tests |
| T4 | Architecture doc package map update | docs | table row |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | T2, T3 | T4 |
| T2 | T1 | T3 | T4 |
| T3 | T2 | P07, P14 | T4 |
| T4 | — | — | all |

## Packages to add
| Package | Version | Workspace |
|---|---|---|
| `@medplum/fhirtypes` | 5.1.42 | `@asc/fhir` |
| `@medplum/core` | 5.1.42 | `@asc/fhir` (only pure helpers like `createReference`; no client) |

## Acceptance
- [ ] No network or `process.env` in `@asc/fhir`
- [ ] Every builder sets facility `meta.account`/Organization tag (multi-site NFR)
- [ ] 100 % test coverage on builders
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q1 | Canonical URL base for our profiles/extensions | T2 | `https://fhir.wybit.io/asc/` (change before go-live costs a migration — decide now) |
| Q2 | Case number format | T2 | `<facility>-<yyyymmdd>-<seq>` |
