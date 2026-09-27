# P26 — Go-live hardening (audit report, break-glass, downtime, UAT)

| Field | Value |
|---|---|
| Wave · Lane · Size | 4 · All · M (split into P26a–d, one per task, for sub-agents) |
| Depends on | P19, P20, P22, P06 |
| Unblocks | Go-live 2026-12-07 |
| Source mix | MP (`AuditEvent`, AccessPolicy) + NEW |
| Requirements | M12-4, M12-6, break-glass (03 §6), downtime NFR, backups NFR |
| Branch | `phase/P26-golive-hardening` |

## Goal
Everything accreditation and a first clinic day need beyond features: audit report export, break-glass, printable downtime packet, backup/restore test, staging + prod environments, performance check, mock clinic days.

## File structure
```text
apps/api/src/routes/{audit-report,break-glass}.ts       NEW
infra/medplum/access-policies/break-glass.json          NEW  1 h elevation, reason required
apps/worker/src/jobs/downtime-packet/*                  NEW  nightly + on-demand PDF (schedule, face sheets, meds/allergies, blank flowsheets)
infra/terraform/envs/{staging,prod}/*                   NEW  copies of dev
docs/runbooks/{backup-restore,downtime,go-live}.md      NEW
apps/web/e2e/mock-clinic-day.spec.ts                    NEW  scripted full journey on synthetic patients
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 (P26a) | Audit report + break-glass | `apps/api`, `infra/medplum` | endpoints + policy |
| T2 (P26b) | Downtime packet job | `apps/worker` | PDF job |
| T3 (P26c) | Staging/prod envs + backup/restore drill | `infra/terraform`, docs | restore proven (RPO ≤ 15 min, RTO ≤ 4 h) |
| T4 (P26d) | Mock clinic day e2e + perf (whiteboard ≤ 2 s, save ≤ 500 ms p95, draft ≤ 60 s) | `apps/web` e2e | report |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | go-live | T2, T3 |
| T2 | — | go-live | T1, T3 |
| T3 | P06 | T4 (runs on staging) | T1, T2 |
| T4 | T3 | go-live | — |

## Packages to add
None.

## Acceptance
- [ ] Break-glass alerts via `@asc/audit`; auto-expires
- [ ] Downtime packet printable offline
- [ ] Restore drill documented with timings
- [ ] Two mock clinic days passed with physicians/anesthesia
- [ ] PROGRESS.md: go-live checklist complete

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q5 | Accreditation path/dates | T1 scope | AAAHC checklist |
| Q13 | State record-retention + reporting specifics | T2, T3 | FL defaults (confirm) |
