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
- [ ] Every builder sets the facility `meta.accounts` Organization tag (multi-site NFR; never the deprecated `meta.account`)
- [ ] 100 % test coverage on builders
- [ ] PROGRESS.md updated

## P03 decisions (2026-10-08)

Recorded here so P04, P07, P08, P11 and P14 find them. Evidence (commands, test names) lives in the P03 PR; the acceptance list above stays unticked, as for the P05 sub-phases.

1. **The canonical base is defined once** (`src/urls.ts`): `FHIR_CANONICAL_BASE` plus `createFhirUrls(base)`, which builds structure definition, code system, value set and identifier system URLs and validates the base and every name. A test fails if the host appears as a literal in any other source file (shown to fail with a planted leak). An override is the optional `FHIR_CANONICAL_BASE` variable, validated in `@asc/config` for api and worker and **passed in** by the app: the package reads no environment (LM-006). The web app always uses the default. The value is stored inside every resource, so it must be identical wherever data is shared.
2. **Every builder stamps `meta.accounts`** for its facility (`facilityMeta` gives `accounts: [Organization/<facility>]`), because Medplum refuses a facility user's write without it (P05h decision 3). Medplum 5.1.42 deprecates the singular `meta.account`; the plural field enforces the same way, pinned live in `apps/bots/live/s1-accounts.live.ts` (create/update in A allowed, create or move into B 403, a nurse at B 404, a write without accounts 403). Nothing in `@asc/fhir` writes the singular field (source test, LM-022). `createTransaction` refuses an entry that does not name exactly the transaction's facility, or that carries `meta.account`, except tenant-wide directory types (Practitioner, PractitionerRole, Organization, Location), which need no tag but must carry only the transaction's facility if they have one. A builder names one facility; a Patient seen at several facilities gets the others through Medplum's `$set-accounts`, a policy still to be decided (not built here). **P04 rule:** an update must send the stored `meta.accounts` back (the Medplum client does when it reads in extended mode; plain HTTP reads do not return it).
3. **`CasePhase` is not redefined.** It stays in `@asc/types` (used by the web and `@asc/clinical-rules`); `@asc/fhir/case-phase` maps it to stored codes (`Record<CasePhase, ...>`, so a new phase without a code fails the type check) and builds the CodeSystem JSON that **P08** loads (`buildCasePhaseCodeSystem`, `buildProcedureIntentCodeSystem`). `CasePhase` and `ProcedureIntent` are re-exported as types. The UI guidelines now import `CasePhase` from `@asc/types`.
4. **Choices of this phase not taken from the product docs** (change them here, not in callers): the `Encounter.status` that goes with each phase (`ENCOUNTER_STATUS_BY_PHASE`: planned, arrived, in-progress, finished, cancelled), the identifier system paths `identifier/mrn` and `identifier/case-number`, the extension names `case-phase`, `procedure-intent`, `agent-execution-id`, the Provenance roles (`author`, `verifier`, `attester`), and Task types as free lower-case names (P12 defines the list and the `task-type` CodeSystem).
5. **Case number decided ([#55](https://github.com/imRahul05/ASC-EHR/issues/55), 2026-10-09):** `<facility>-<yyyy>-<seq>`, the year only (2000–2099) and a six-digit running number per facility and year, so the date of service is not spelled out on the whiteboard, in URLs or in logs. It is still a HIPAA identifier whatever its format (a unique identifying code, Safe Harbor §164.514(b)(2)(i)(R)): never logged or shown next to a patient name, and URLs carry the internal id. **Not confirmed yet:** the eCW practice id format is unconfirmed (06 §7), so the check accepts letters, digits, `_` and `-`.
6. **PHI.** Builder inputs and identifiers can be PHI (names, birth date, MRN, eCW id, case number). Errors name the field and never echo the value (tested); nothing logs. The agent execution id is an opaque id and the check rejects free text.
7. **Packages.** `@medplum/core` was **not** added (planned for `createReference`): the helper is a few lines and keeping it out keeps Medplum code out of browser bundles. `@asc/types` (types only) was added as a dependency. `@vitest/coverage-v8` is a dev dependency of this package only, and `pnpm test` fails below 100 % for the whole package (135/135 statements, 148/148 branches).
8. **Module format (LM-005).** Files a browser can reach import siblings through their leaf name (`@asc/fhir/urls`), never by relative path; only `index.ts` (for Node code) uses relative paths. A test enforces it. Browser code imports the leaves (`@asc/fhir/urls`, `/identifiers`, `/case-phase`, `/extensions`, `/bundle`, `/builders/*`), not the root.

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q1 | Canonical URL base for our profiles/extensions | T2 | **Decided 2026-10-08 ([#54](https://github.com/imRahul05/ASC-EHR/issues/54)): `https://fhir.wybit.io/asc/`.** One constant plus a URL factory in `@asc/fhir`; optional `FHIR_CANONICAL_BASE` override validated in `@asc/config` and passed in (LM-006); never a literal elsewhere (test) |
| Q2 | Case number format | T2 | Decided: `<facility>-<yyyy>-<seq>` ([#55](https://github.com/imRahul05/ASC-EHR/issues/55)) |
