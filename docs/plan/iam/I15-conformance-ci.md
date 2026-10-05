# I15 — Policy conformance suite in CI

| Field | Value |
|---|---|
| Track · Size | B · M |
| Depends on | I03, I10, P01 (CI exists) |
| Unblocks | I16, I17 |
| Requirements | ADR confirmation ("every role template × resource × action matches §7.4") |
| Branch | `phase/I15-conformance-ci` |

## Goal
CI starts a disposable Medplum, provisions a test tenant with two facilities, and checks every role template against every resource and action in its data rules, plus facility isolation and the multi-role cases. A template change that widens access fails CI unless the expected matrix is updated in the same PR.

## Out of scope
Cross-tenant attack suite (I17), performance tests.

## File structure
```text
apps/bots/conformance/harness.ts            NEW   start/stop Medplum (docker compose profile), provision test tenant via I10
apps/bots/conformance/expected-matrix.ts    NEW   generated from templates' data rules (role × resource × read/write/hidden)
apps/bots/conformance/matrix.test.ts        NEW   one test per cell
apps/bots/conformance/facility.test.ts      NEW   rn@A cannot read/write B; User X cases
apps/bots/conformance/constraints.test.ts   NEW   final Composition immutable; hidden fields hidden
apps/bots/conformance/union.test.ts         NEW   combinations allowed by S1b behave as documented
docker-compose.yml                          EDIT  "conformance" profile
.github/workflows/<ci>.yml                  EDIT  add conformance job (path filter: packages/authz, apps/bots, infra/medplum)
```

## Commit plan
| # | Commit | ~Lines |
|---|---|---|
| C1 | `test(bots): conformance harness with disposable Medplum` | 140 |
| C2 | `test(bots): generate expected matrix from role templates` | 100 |
| C3 | `test(bots): role x resource x action matrix` | 120 |
| C4 | `test(bots): facility isolation and multi-facility user` | 120 |
| C5 | `test(bots): write constraints and hidden fields` | 90 |
| C6 | `test(bots): allowed role combinations` | 80 |
| C7 | `chore(ci): run conformance suite on authz and policy changes` | 60 |
| C8 | `docs(iam): how to read and update the conformance matrix` | 50 |

## Checklist
- [ ] Suite runs locally with one command and in CI under 10 minutes
- [ ] Synthetic data only
- [ ] Widening a template without updating the expected matrix fails (demonstrated in PR)
- [ ] Job required on PRs touching `packages/authz/**`, `apps/bots/scripts/provision/**`
- [ ] Green; PROGRESS.md updated
