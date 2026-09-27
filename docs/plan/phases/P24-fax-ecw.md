# P24 — Fax (faxagnet) + eCW (Integuru) integration

| Field | Value |
|---|---|
| Wave · Lane · Size | 3 · Integration · M |
| Depends on | P10, P12 (+ Q-MS4, Q-MS5) |
| Unblocks | P23 letters out by fax; referral intake |
| Source mix | **MS** (faxagnet service, proxy pattern; `lib/ecw/*` Integuru client, hash-diff sync, once-only write-back) |
| Requirements | X3, M17 (P1 outbound), 06 §3/§5 |
| Branch | `phase/P24-fax-ecw` |

## Goal
Staff work the referral fax inbox inside ASC EHR (proxy to faxagnet), attach faxes to patients as `DocumentReference` + `referral-intake` Task; outbound letters sent via faxagnet (or eFax fallback); optional read of eCW referral docs/prior notes and gated write-back of signed notes.

## File structure
```text
packages/config/src/flags.ts                       EDIT ECW_READ, ECW_WRITEBACK, FAX_OUTBOUND
packages/validation/src/fax/*.ts · ecw/*.ts        NEW  allowlisted request/response shapes
apps/api/src/routes/fax.ts                         NEW  /fax/* proxy: allowlist, 60 s signed service token (jose), no cookies, 401→502 mapping
apps/worker/src/jobs/{fax-send,ecw-read,ecw-writeback}/*   NEW
packages/db/src/schema/{writeback-ledger,ecw-sync-snapshots}.ts  NEW  once-only + hash-diff (MS pattern)
packages/ui/src/components/fax/{fax-inbox,fax-viewer,attach-dialog}.tsx  NEW (port MS UX if available)
apps/web/src/app/(clinical)/faxes/page.tsx         NEW
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Flags + schemas | `@asc/config`, `@asc/validation` | contracts |
| T2 | Fax proxy route | `apps/api` | route + contract tests against faxagnet mock |
| T3 | Worker jobs + ledger tables | `apps/worker`, `@asc/db` | jobs + migration |
| T4 | Fax UI | `@asc/ui` → `apps/web` | inbox flow |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | all | — |
| T2 | T1 | T4 | T3 |
| T3 | T1 | P23 letters | T2, T4 |
| T4 | T2 | — | T3 |

## Packages to add
| Package | Version | Workspace |
|---|---|---|
| `jose` | 6.2.12 | `apps/api` |

## Acceptance
- [ ] Only allowlisted faxagnet paths reachable; demo/staging blocked from real fax
- [ ] eCW write-back off by default; once-only per encounter (ledger)
- [ ] BAAs recorded for faxagnet hosting + Integuru before enabling in prod
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q-MS4 | faxagnet outbound, hosting, BAA, non-eCW attach target | T2, T3 | Inbound only; outbound via Medplum eFax bot |
| Q-MS5 | Integuru BAA + allowed actions for a second product | T3 eCW | Flags off at go-live |
