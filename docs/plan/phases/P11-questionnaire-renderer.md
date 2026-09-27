# P11 — Questionnaire renderer + forms-as-data

| Field | Value |
|---|---|
| Wave · Lane · Size | 2 · UI · M |
| Depends on | P03, P09 |
| Unblocks | P16, P17, P21, P25 |
| Source mix | MP (`Questionnaire`/`QuestionnaireResponse`, extraction Bot) + NEW (renderer in our design system) |
| Requirements | Decision "forms are data"; M03, M04, M08, M11, X2 |
| Branch | `phase/P11-questionnaire-renderer` |

## Goal
One renderer in `@asc/ui` for FHIR Questionnaires (enableWhen, required, repeats, calculated scores hook), forms authored as TS data in `@asc/fhir`, and an extraction Bot that turns answers into Observations.

## Out of scope
Specific clinical form content beyond one sample (each slice adds its forms).

## File structure
```text
packages/fhir/src/questionnaires/{index,sample-vitals}.ts     NEW  forms as typed data + version
packages/ui/src/components/questionnaire/
  questionnaire-form.tsx      NEW  props: questionnaire, value, onChange, readOnly, variant("desk"|"room")
  items/{string,boolean,choice,decimal,date,group,display}.tsx NEW
  enable-when.ts              NEW  pure evaluator (tested)
packages/validation/src/questionnaire.ts                       NEW  response submit schema
apps/bots/src/extract-questionnaire.ts                         NEW  Subscription on QuestionnaireResponse → Observations (by linkId map)
apps/web/src/features/forms/use-questionnaire.ts               NEW  load Q + save QR via Medplum (user token)
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Form data format + sample form | `@asc/fhir` | typed Questionnaire |
| T2 | Renderer + enableWhen evaluator | `@asc/ui` | component + tests |
| T3 | Extraction Bot | `apps/bots` | bot + MockClient test |
| T4 | Web hook + dev page | `apps/web` | save/load works |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | T2, T3 | — |
| T2 | T1 | T4 | T3 |
| T3 | T1 | P16 | T2 |
| T4 | T2 | P16, P17 | T3 |

## Packages to add
| Package | Version | Workspace |
|---|---|---|
| `@medplum/bot-layer` | 5.1.42 | `apps/bots` (dev) |

## Acceptance
- [ ] Renderer handles enableWhen, required, repeats; keyboard + touch
- [ ] Bot creates Observations with Provenance; re-save doesn't duplicate
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q1 | Support SDC calculatedExpression (FHIRPath) now? | T2 | No — scores via `@asc/clinical-rules` hook |
