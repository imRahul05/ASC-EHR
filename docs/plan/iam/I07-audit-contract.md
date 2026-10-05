# I07 — Audit contract: tenant, facility, IAM events, append-only

| Field | Value |
|---|---|
| Track · Size | A · S |
| Depends on | I01 |
| Unblocks | I08, I14 |
| Requirements | M12-4, 08 §12.3 |
| Branch | `phase/I07-audit-contract` |

## Goal
`@asc/audit` events can say *who, where (tenant/facility), what, outcome, which gate* for every security-relevant action, with a typed IAM event vocabulary. Production refuses stores that are not durable **and** append-only.

## Out of scope
The durable store itself (I14). Medplum `AuditEvent` (automatic for FHIR).

## File structure
```text
packages/audit/src/index.ts              EDIT  AuditEvent: tenantId, facilityId, membershipId, sessionId, actorKind, gate, clientIpHash?
packages/audit/src/iam-events.ts         NEW   IAM_EVENTS const + typed details per event
packages/audit/src/denied.ts             NEW   deniedEvent({gate, capability, …}) helper
packages/audit/src/*.test.ts             EDIT/NEW
packages/audit/README.md                 NEW/EDIT
```

## Commit plan
| # | Commit | ~Lines |
|---|---|---|
| C1 | `feat(audit): add tenant, facility, membership and session fields` | 80 |
| C2 | `feat(audit): require tenantId except platform events` | 70 |
| C3 | `feat(audit): add IAM event vocabulary with typed details` | 130 |
| C4 | `feat(audit): add denied-event helper with gate number` | 60 |
| C5 | `feat(audit): require append-only durable store in production` | 60 |
| C6 | `test(audit): PHI key guard covers new fields and IAM details` | 90 |
| C7 | `docs(audit): document fields, vocabulary and store contract` | 60 |

## Checklist
- [ ] `organizationId` handled: renamed or aliased to `tenantId` per Q-IAM-A, with no silent meaning change
- [ ] Client IP handling follows Q-IAM-B (hash/truncate by default) and never passes through `details`
- [ ] Event vocabulary matches I00 C7 exactly (test compares lists)
- [ ] `AuditStore` gains `appendOnly: boolean`; production boot with `durable && appendOnly` false throws (test)
- [ ] Details for IAM events contain IDs and keys only (role key, capability, gate), never names or emails
- [ ] Green at every commit; `phi-review` run; PROGRESS.md updated
