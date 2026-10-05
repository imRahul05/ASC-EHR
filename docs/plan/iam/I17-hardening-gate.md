# I17 — IAM go-live hardening gate

| Field | Value |
|---|---|
| Track · Size | B · M |
| Depends on | I06, I08, I11, I12, I13, I14, I15, I16 |
| Unblocks | P26 go-live |
| Requirements | M12-2…M12-4, README §7 global security checklist |
| Branch | `phase/I17-iam-hardening` |

## Goal
Independent evidence that tenant and facility isolation, authentication and authorization hold across every store and path before real PHI. Output is a signed-off report, not new features.

## Out of scope
Break-glass (I22, also required for P26), SSO (I21).

## File structure
```text
apps/api/src/__tests__/attack/*.test.ts      NEW   cross-tenant / cross-facility / IDOR / token-replay / host-spoof
apps/web/src/__tests__/security/*.test.ts    NEW   storage, CSP, cookie flags
docs/security/iam-threat-model.md            NEW   STRIDE per gate and store
docs/security/iam-go-live-report.md          NEW   checklist results, pen-test summary, sign-off
```

## Commit plan
| # | Commit | ~Lines |
|---|---|---|
| C1 | `docs(security): IAM threat model per gate and store` | 150 |
| C2 | `test(api): cross-tenant attack suite` | 150 |
| C3 | `test(api): cross-facility and IDOR attack suite` | 140 |
| C4 | `test(api): token replay and host spoofing cases` | 100 |
| C5 | `test(web): browser storage, cookie flags and CSP checks` | 100 |
| C6 | `fix(*): findings from the attack suites` (one commit per finding) | small each |
| C7 | `docs(security): IAM go-live report with sign-off` | 120 |

## Checklist
- [ ] README §7 global security checklist re-verified item by item, with evidence links
- [ ] Attack suites run in CI
- [ ] External or peer pen test done on staging; every High/Critical fixed or accepted in writing
- [ ] Rate limits per `tenant:user` verified under load
- [ ] Secrets scan clean; no super-admin credentials in runtime config
- [ ] `phi-review` on the whole IAM surface
- [ ] Session timeout, logout and disable-user behaviour demonstrated on staging
- [ ] Sign-off (security owner + engineering lead) recorded in the report
- [ ] PROGRESS.md updated; P26 dependency satisfied
