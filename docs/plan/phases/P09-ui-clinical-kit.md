# P09 — `@asc/ui` clinical kit + app shell

| Field | Value |
|---|---|
| Wave · Lane · Size | 2 · UI · M |
| Depends on | P00 |
| Unblocks | P11, P13, P14, all UI slices |
| Source mix | NEW (+ MS visual patterns: muted cancelled rows, gap-chips) |
| Requirements | Procedure-room UX NFR; WCAG 2.2 AA; [UI guidelines](../../agent/ui-guidelines.md) |
| Branch | `phase/P09-ui-clinical-kit` |

## Goal
The shared building blocks every clinical screen uses, so feature phases only compose: clinical layout shell, patient banner, status chips, AI draft states, async-state components, data table, toasts, keyboard shortcuts, touch sizing. Plus `CATALOG.md` so agents find components before creating new ones.

## Out of scope
Questionnaire renderer (P11), Record engine (P13), calendar (P15), flowsheet (P20).

## File structure
```text
packages/ui/src/components/clinical/
  patient-banner.tsx            NEW  name/age/sex/allergies/case phase — props only
  status-chip.tsx               NEW  case phase + worklist status colours (tokens)
  gap-chip.tsx                  NEW  "missing X" chip (MS pattern)
  draft-banner.tsx              NEW  AI draft / preliminary marker, never dismissible until reviewed
  provenance-chip.tsx           NEW  who/what produced a value (human vs agent + version)
  streaming-text.tsx            NEW  renders partial AI text with aria-live="polite"
  async-state.tsx               NEW  <Loading/> <Empty/> <ErrorState retry/> <Stale/> <Offline/>
  data-table.tsx                NEW  TanStack Table + virtual rows, keyboard nav
packages/ui/src/components/layout/clinical-shell.tsx   NEW  sidebar + top bar + banner slot
packages/ui/src/tokens.css                             EDIT clinical colour tokens (phase, severity, draft), touch sizes
packages/ui/src/hooks/use-hotkeys.ts                   NEW  wrapper over react-hotkeys-hook with registry
packages/ui/CATALOG.md                                 NEW  every export: purpose, props, when NOT to use
packages/ui/src/**/*.test.tsx                          NEW
apps/web/src/app/(clinical)/layout.tsx                 NEW  uses ClinicalShell
apps/web/src/lib/mock → msw handlers                   EDIT replace hand-rolled mocks with msw (dev only)
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Tokens + clinical-shell + patient banner + status/gap chips | `@asc/ui` | components + tests |
| T2 | AI-state components (draft banner, provenance chip, streaming text) | `@asc/ui` | components + tests |
| T3 | Async-state set + data table + toasts + hotkeys | `@asc/ui` | components + tests |
| T4 | `CATALOG.md` generated/maintained list | `@asc/ui` | catalog |
| T5 | `(clinical)` layout + msw dev mocks in web | `apps/web` | shell renders |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | T5 | T2, T3 |
| T2 | — | P16, P19 | T1, T3 |
| T3 | — | P12, P22 | T1, T2 |
| T4 | T1–T3 | — | T5 |
| T5 | T1 | P14 | T4 |

(T1–T3 are the same package → run **sequentially** by one agent, or split files and merge carefully; do not run two agents in `@asc/ui` at once.)

## Packages to add
| Package | Version | Workspace |
|---|---|---|
| `@tanstack/react-table` | 9.2.4 | `@asc/ui` |
| `@tanstack/react-virtual` | 3.14.13 | `@asc/ui` |
| `sonner` | 2.0.8 | `@asc/ui` |
| `react-hotkeys-hook` | 5.3.3 | `@asc/ui` |
| `@testing-library/react` | 16.3.3 | `@asc/ui` (dev) |
| `msw` | 2.15.0 | `apps/web` (dev) |
| `nuqs` | 2.10.1 | `apps/web` |

## Acceptance
- [ ] All components prop-driven; no fetch/Medplum imports in `@asc/ui`
- [ ] axe checks pass in component tests; touch targets ≥ 44 px (48 px in procedure-room variant)
- [ ] Every export listed in CATALOG.md
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q1 | Brand/design tokens from MindScript to share? | T1 | Reuse MindScript palette if provided, else current `@asc/ui` tokens |
| Q2 | TanStack Table v9 stable enough? | T3 | If API unstable, pin 8.x latest and record decision |
