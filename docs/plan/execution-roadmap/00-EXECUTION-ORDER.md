# 00 — Execution order (start here)

> **Purpose:** the single ordered list of work that gets the ASC EHR from its state on 2026-10-16 to fully matching Anurag's Oct 7 master spec (`docs/product/master-requirements.md`, `docs/product/master-build-specification.md`).
> **Anchors:** software freeze **Nov 15, 2026** · dry runs Nov 27 – Dec 14 · facility opening **Jan 2027**.
> **Rule:** hand **one plan file** to a coding agent at a time (or run plans in parallel only where the order below says so). After each PR, run a `code-reviewer` subagent on it against that plan + `LEARNING_MISTAKES.md`, fix the findings, then merge.

## Standard prompt to give a coding agent
```
Read AGENTS.md, LEARNING_MISTAKES.md, PROGRESS.md, then execute
docs/plan/execution-roadmap/<PLAN FILE> exactly. Atomic commits ≤400 lines,
zero any/unknown, leaf subpath imports, MSW lockstep, clinicalMutationRoute,
regulatory JSDoc citations. Run the full verification at the end and open a PR.
```

## Standard review prompt (for a code-reviewer subagent)
```
Review PR #<N> read-only (gh pr diff <N>) against
docs/plan/execution-roadmap/<PLAN FILE>, docs/product/master-build-specification.md
(the listed US-/AC- ids) and LEARNING_MISTAKES.md. Check: contract drift between
Fastify / MSW / api-client, hook order (capability first), idempotency scope,
any/unknown, root-barrel imports, missing package.json exports, hook budget,
tenant isolation, regulatory citations, tests. Verdict + file:line findings.
```

---

## Order

| # | Plan file | Scope (master spec) | Can run in parallel with | Gate to move on |
|---|---|---|---|---|
| **1** | [01-FIX-PR104-P01-P12.md](01-FIX-PR104-P01-P12.md) | Fix the 3 blocking + 3 important findings on PR #104 (CI, worklist) | — | PR #104 merged, CI green on main |
| **2** | [02-REVIEW-AND-REBASE-PR105-P18.md](02-REVIEW-AND-REBASE-PR105-P18.md) | Rebase PR #105 on main, run the review checklist, fix, merge (US-F-05/06/07, US-I-04/05) | — | PR #105 merged |
| **3a** | [03-PLAN-P20-AIMS-FLOWSHEET.md](03-PLAN-P20-AIMS-FLOWSHEET.md) | AIMS + offline queue (US-F-08/09, US-E-05) | 3b | merged |
| **3b** | [04-PLAN-P08-P13-P19-NOTE-PIPELINE.md](04-PLAN-P08-P13-P19-NOTE-PIPELINE.md) | Terminology, discrete findings, AI note + sign (EP-G) — 3 sequential PRs | 3a | P19 merged |
| **4a** | [05-PLAN-P21-P23-P25-PACU-PATHOLOGY-SCOPES.md](05-PLAN-P21-P23-P25-PACU-PATHOLOGY-SCOPES.md) §A | PACU + discharge (US-F-10..13) — needs P20 | 4b, 4c | merged |
| **4b** | same file §B | Pathology closed loop (EP-H) | 4a, 4c | merged |
| **4c** | same file §C | Scope register, traceability, adverse events (EP-I) | 4a, 4b | merged |
| **5** | [06-PLAN-P22B-GI-CODING-AND-837-CLAIMS.md](06-PLAN-P22B-GI-CODING-AND-837-CLAIMS.md) | Coding engine, PT/33, mod 51/XS, Gate 3, 837 (EP-J, EP-K) — needs P19 | 6 | merged |
| **6** | [07-PLAN-P15D-P11-SCHEDULING-AND-PREOP-COMPLETION.md](07-PLAN-P15D-P11-SCHEDULING-AND-PREOP-COMPLETION.md) | Blocks, appropriateness, reschedule/cancel, prep, questionnaires (EP-C/EP-E gaps) | 5 | merged |
| **7** | [08-PLAN-P24-FAX-REFERRAL-INTAKE.md](08-PLAN-P24-FAX-REFERRAL-INTAKE.md) | Fax intake, extraction, urgent triage, eCW stub (EP-B gaps) | 5, 6 | merged |
| **8** | [09-PLAN-P26-EPL-ADMIN-QAPI-GOLIVE.md](09-PLAN-P26-EPL-ADMIN-QAPI-GOLIVE.md) | P10 SSE → P00b → EP-A admin → EP-L QAPI → P26 hardening + E2E | 9.1/9.2 may start any time after step 2 | **Software freeze Nov 15** |

### Target calendar (aggressive, agent-driven)
| Week | Steps |
|---|---|
| Oct 16–19 | 1, 2 |
| Oct 20–26 | 3a + 3b (P08, P13) |
| Oct 27 – Nov 2 | 3b (P19), 4a, 4b, 4c |
| Nov 3–9 | 5, 6, 7 (P10/P00b squeezed in parallel) |
| Nov 10–15 | 8 (EP-A, EP-L, P26) → **FREEZE** |
| Nov 16 – Dec 14 | P26 remainder, P06 envs, dry runs 1–3, bug fixes only |

## External decisions to chase now (open GitHub issues, label `question`)
1. **Q-MS1**: MindScript record engine access. P13 uses a fallback if this is unanswered.
2. **Q-MS4/Q-MS5**: faxagnet and eCW/Integuru credentials. P24 builds behind stubs until then.
3. **Q-CPT**: AMA CPT licence for full code descriptors. P22b uses an internal GI subset until then.
4. **Clearinghouse partner** (270/271/278/837/835 endpoints) for P22a/P22b live connectivity.
5. **Azure subscription + BAA** for P06 staging/prod.
6. **Anurag sign-off** on the ADR thresholds config (25/30 vs 35/25) and on the post-op call work-item type.

## After every merged PR
1. Update `PROGRESS.md` (row status, PR, Done log, next up).
2. Add any correction to `LEARNING_MISTAKES.md` (next LM number).
3. Update `docs/product/master-feature-traceability.md`: flip the rows for the delivered `US-*` stories to Done with the PR number.
