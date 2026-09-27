# P18 — Procedure-room capture (events, specimens, images, STT)

| Field | Value |
|---|---|
| Wave · Lane · Size | 3 · Clinical · M |
| Depends on | P15, P10 |
| Unblocks | P19, P23 |
| Source mix | MS (Deepgram browser STT with short-lived token; mid-visit precompute) + MP (`Observation`, `Specimen`, `Media`, Binary) + NEW (room tablet UX) |
| Requirements | M05-3, M05-4, M06-1…M06-4, M10-1; procedure-room UX NFR |
| Branch | `phase/P18-procedure-capture` |

## Goal
Room tablet (gloved, one-tap): event timestamps (cecum reached, withdrawal start, scope out), specimen jar per polyp with label print, image upload bound to case/finding, live narration transcript via STT.

## Out of scope
Tower DICOM (P1.5), note generation (P19).

## File structure
```text
packages/validation/src/capture/{events,specimen,image,transcript}.ts   NEW
packages/fhir/src/builders/{procedure-event,specimen,media}.ts          NEW
packages/clinical-rules/src/withdrawal-time.ts                          NEW
apps/api/src/routes/stt.ts                                              NEW  POST /stt/token (short-lived, audited)
apps/api/src/routes/capture.ts                                          NEW  POST /cases/:id/events · /specimens · /transcript-segments
packages/ui/src/components/clinical/{event-tap-bar,specimen-jar-list,image-strip,live-transcript}.tsx  NEW  room variant (48 px+)
packages/api-client/src/stt.ts                                          NEW  browser STT session (mic → vendor WS) behind interface
apps/web/src/app/(clinical)/cases/[caseId]/procedure/page.tsx           NEW
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Capture schemas + builders | `@asc/validation`, `@asc/fhir` | contracts |
| T2 | Withdrawal-time rule | `@asc/clinical-rules` | tests |
| T3 | STT token + capture commands | `apps/api` | endpoints |
| T4 | STT browser session (vendor adapter) | `@asc/api-client` | adapter + fake |
| T5 | Room components | `@asc/ui` | components |
| T6 | Procedure page | `apps/web` | flow |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | all | — |
| T2 | T1 | T6 | T3–T5 |
| T3 | T1 | T4, T6 | T2, T5 |
| T4 | T3 | T6 | T5 |
| T5 | T1 | T6 | T2–T4 |
| T6 | T2–T5 | P19 | — |

## Packages to add
| Package | Version | Workspace |
|---|---|---|
| `@deepgram/sdk` | 5.12.0 | `apps/api` (token minting only; if Deepgram chosen) |

## Acceptance
- [ ] Event taps work offline-briefly (queued, see P20 pattern) and show server confirmation
- [ ] STT token TTL ≤ 60 s, audit event on issue; audio never stored by us unless decided
- [ ] Transcript segments stored as PHI in Medplum (not Redis/logs)
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q15/Q-MS7 | STT vendor + BAA | T3, T4 | Deepgram behind adapter; fake adapter until BAA |
| Q2 | Tower/capture card output | image path | Upload from capture station file share |
| Q16 | Label printer model | specimen labels | Browser print of PDF label |
