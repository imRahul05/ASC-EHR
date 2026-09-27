# P13 — Record engine port (MindScript → `@asc/ui/record`)

| Field | Value |
|---|---|
| Wave · Lane · Size | 2 · UI · M |
| Depends on | P09 (+ Q-MS1 source access) |
| Unblocks | P16, P19 |
| Source mix | **MS** (section editors on typed `structuredData`, Tiptap, click-to-edit rows, in-note ⇄ panel sync, gap-chips, sign lock) |
| Requirements | M05-7; appendix "The Record" rows |
| Branch | `phase/P13-record-engine` |

## Goal
A documentation surface that renders typed sections, lets clinicians edit either as rows (panel) or as text (note) with both views in sync, marks AI-drafted values, shows gap-chips, and locks on sign.

## Out of scope
GI section content (P16/P19 define schemas), sign command (P19).

## File structure
```text
packages/validation/src/record/section.ts        NEW  generic Section<T> { id, kind, status, data, provenance, gaps[] }
packages/ui/src/components/record/
  record-view.tsx          NEW  ported layout (MS)
  section-panel.tsx        NEW  row editor from schema
  section-note.tsx         NEW  Tiptap note view, marks per field for sync
  sync.ts                  NEW  pure: text edits ⇄ structured data mapping (tested)
  lock-overlay.tsx         NEW  signed/locked state, addendum entry point
packages/ui/PORTING.md                           NEW  MindScript source commit, diffs made (Radix→Base UI, Vite→Next)
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Section schema (generic) | `@asc/validation` | Zod |
| T2 | Port components from MindScript (record MS sha in PORTING.md); swap primitives to Base UI | `@asc/ui` | components |
| T3 | Sync logic tests (row edit → note, note edit → row, conflict rules) | `@asc/ui` | tests |
| T4 | Dev page with fake GI sections | `apps/web` | `/dev/record` |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | T2 | — |
| T2 | T1, Q-MS1 | T3, T4 | — |
| T3 | T2 | P19 | T4 |
| T4 | T2 | — | T3 |

## Packages to add
| Package | Version | Workspace |
|---|---|---|
| `@tiptap/react` | 3.31.3 | `@asc/ui` |
| `@tiptap/starter-kit` | 3.31.3 | `@asc/ui` |
| `@tiptap/pm` | 3.31.3 (match) | `@asc/ui` |

## Acceptance
- [ ] No Radix, no Wouter, no Clerk imports
- [ ] AI values visibly marked until clinician touches/accepts them
- [ ] Locked record is read-only; addendum path present
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q-MS1 | Source access to MindScript | T2 | If no access by P13 start: build from 06 description + screenshots (M, +2 days) |
| Q-MS9 | MindScript Tiptap/Tailwind versions | T2 | Use latest listed here |
