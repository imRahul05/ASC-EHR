# I09 — Medplum spikes (prove the assumptions before building on them)

| Field | Value |
|---|---|
| Track · Size | B · S (time-boxed: ≤ ½ day per spike) |
| Depends on | P02 (local Medplum 5.1.42), I03 (compiled sample policies) |
| Unblocks | I10 (hard gate), I11, I12, I13 |
| Requirements | 08 §14 |
| Branch | `phase/I09-medplum-spikes` |

## Goal
Every Medplum behaviour the design relies on is either **confirmed on local Medplum 5.1.42** or has a **written fallback** in the ADR. No later phase may assume an unconfirmed behaviour.

## Out of scope
Production code. Spike scripts are kept (they seed I15 conformance tests) but are not imported by apps.

## Spikes
| ID | Question | Pass criterion | Fallback if it fails |
|---|---|---|---|
| S1 | `_compartment=%facility` with `meta.accounts` filters reads and searches; `writeConstraint` blocks edits of a `final` Composition; access-token lifetime configurable on `ClientApplication`; token exposes auth time | A user bound to facility A gets 0 results / 403 for facility B resources; final note PUT → 403 | Per-facility policies without parameters; facility gate 3 in API becomes the primary check for writes |
| S1b | Two `access[]` entries with different policies: union semantics for `hiddenFields`, `readonly`, `writeConstraint` | Documented truth table; no field becomes visible that both policies hide | Forbid combining conflicting templates (provisioner validation rule) |
| S4 | Same email as project-scoped user in two Projects; login with `projectId` | Two independent logins, no cross-project token use | Server-scoped users for multi-tenant staff (needs ADR update) |
| S5 | Per-tenant `ClientApplication` with client credentials limited by its own AccessPolicy | Worker client can only touch its allowed types in its own Project | One client per tenant with super-narrow Bot instead |
| S6 | Setting membership inactive: effect on existing access token, refresh, `/auth/me` | Measured delay ≤ cache TTL (60 s) | Shorter access-token lifetime + revocation list in API cache |
| S7 | `/auth/me` payload contains membership `access[]` with parameters, enough to build `grants` | Fixture recorded; I11 mapping can be written from it | Read `ProjectMembership` with the user's token after `/auth/me` |

## File structure
```text
apps/bots/scripts/spikes/s1-facility-compartment.ts   NEW
apps/bots/scripts/spikes/s1b-policy-union.ts          NEW
apps/bots/scripts/spikes/s4-project-users.ts          NEW
apps/bots/scripts/spikes/s5-client-credentials.ts     NEW
apps/bots/scripts/spikes/s6-membership-disable.ts     NEW
apps/bots/scripts/spikes/s7-auth-me-shape.ts          NEW
apps/bots/scripts/spikes/fixtures/auth-me.json        NEW   PHI-free synthetic recording
docs/decisions/2026-10-xx-iam-spike-results.md        NEW   result + fallback per spike
docs/product/08-identity-access-and-tenancy.md        EDIT  mark each S as confirmed / fallback
```

## Commit plan
| # | Commit | ~Lines |
|---|---|---|
| C1 | `test(bots): spike S1 facility compartment and write constraint` | 150 |
| C2 | `test(bots): spike S1b policy union semantics` | 120 |
| C3 | `test(bots): spike S4 project-scoped users across projects` | 100 |
| C4 | `test(bots): spike S5 per-tenant client credentials` | 100 |
| C5 | `test(bots): spike S6 membership disable latency` | 100 |
| C6 | `test(bots): spike S7 record auth me payload` | 60 + fixture |
| C7 | `docs(adr): record IAM spike results and fallbacks` | 120 |
| C8 | `docs(iam): mark spikes confirmed or fallback in 08` | 40 |

## Checklist
- [ ] Each spike script is runnable with one command and documented in the ADR
- [ ] Fixtures contain synthetic data only (no real names, emails, patient data)
- [ ] Every failed spike has a fallback recorded **and** the dependent phase file updated
- [ ] I10 not started until S1, S1b, S7 are confirmed or have accepted fallbacks
- [ ] PROGRESS.md updated
