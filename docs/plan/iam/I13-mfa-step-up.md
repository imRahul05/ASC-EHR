# I13 — MFA enforcement and step-up for high-risk actions

| Field | Value |
|---|---|
| Track · Size | B · S |
| Depends on | I11, I12 |
| Unblocks | I17; sign/attest routes in P19, P21, P22 |
| Requirements | M12-3, 08 §5.2, §5.3 |
| Branch | `phase/I13-mfa-step-up` |

## Goal
Every staff member without hospital SSO must use TOTP. Capabilities flagged `stepUp` in the catalog (`note.sign`, `note.addend`, `coding.attest`, `discharge.approve`, `breakglass.invoke`, `admin.*`) need a sign-in within the last 5 minutes; otherwise the API returns `401 step_up_required` and the UI re-authenticates and retries once.

## Out of scope
SSO MFA (hospital IdP owns it, I21), recovery-code UX beyond Medplum's built-in.

## File structure
```text
apps/web/src/features/auth/mfa-enroll.tsx · mfa-verify.tsx   NEW   via @medplum/core login API, @asc/ui components
packages/authz/src/step-up.ts                                NEW   requiresStepUp(cap), isFresh(authTime, now, window)
apps/api/src/guards/require-fresh-auth.ts                    NEW   reads authTime (S1 claim) → 401 step_up_required
apps/api/src/__tests__/step-up-coverage.test.ts              NEW   every route guarded by a stepUp capability also has fresh-auth
apps/web/src/lib/session/step-up.ts                          NEW   on 401 step_up_required → prompt=login → retry once
packages/db/src/schema/tenants.ts                            EDIT  mfa_mode: "medplum" | "idp" (if not added in I06)
```

## Commit plan
| # | Commit | Workspace | ~Lines |
|---|---|---|---|
| C1 | `feat(authz): step-up helpers from capability catalog` | `@asc/authz` | 60 |
| C2 | `feat(api): require fresh auth for step-up capabilities` | `apps/api` | 90 |
| C3 | `test(api): step-up coverage for every flagged route` | `apps/api` | 70 |
| C4 | `feat(web): MFA enrolment and verification screens` | `apps/web` | 150 |
| C5 | `feat(web): handle step_up_required and retry once` | `apps/web` | 100 |
| C6 | `feat(api): enforce MFA for staff when tenant mode is medplum` | `apps/api` | 70 |
| C7 | `feat(audit): emit auth.stepup and auth.mfa.enrolled` | `apps/api` | 40 |
| C8 | `docs(iam): MFA and step-up operator notes` | docs | 50 |

## Checklist
- [ ] Step-up window = 5 min (D-A9), configurable per tenant only downward
- [ ] Retry happens once; a second `step_up_required` shows an error, no loop (test)
- [ ] Staff principal without MFA (tenant mode `medplum`) cannot reach any PHI route (test)
- [ ] Step-up coverage test fails when a new flagged route forgets the guard
- [ ] Green at every commit; `phi-review` run; PROGRESS.md updated
