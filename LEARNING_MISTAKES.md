# LEARNING_MISTAKES — corrected mistakes become rules

> Every agent reads this file **before writing code**. It is the repo's memory of mistakes that a human (or review) had to correct, so they are not repeated.
> Related: [`AGENTS.md`](AGENTS.md) · [architecture rules](docs/agent/architecture.md) · [UI guidelines](docs/agent/ui-guidelines.md) · [`PROGRESS.md`](PROGRESS.md)

## When to add an entry (mandatory)

Add an entry **in the same commit as the fix** whenever:
- the user corrects how you did something ("don't put that in the app", "that belongs in the package", "you forgot the audit event"), or
- a review, lint rule, test or `phi-review` catches something an agent wrote, or
- you notice you (or a previous agent) broke a rule in `docs/agent/*`.

Do not add: one-off typos, things only relevant to one conversation, or secrets/PHI (never paste patient data or keys here).

If the mistake already has an entry, **don't duplicate** — increment *Seen* and add the new reference.
If a rule can be enforced by a tool (lint, test, CI), add the guard and set *Guarded by*; a guarded rule is better than a remembered one.

## Entry template

```md
### LM-XXX — <short rule, imperative>
- **Seen:** <n> · <date> · <branch/PR/commit>
- **What went wrong:** <one or two sentences, concrete file paths>
- **Rule:** <what to do instead>
- **How to check:** <grep / command / lint rule that detects it>
- **Guarded by:** <lint rule / test / CI step, or "not yet — see Pxx">
```

---

## Quick rules (digest of all entries — read this if nothing else)

1. Logic, types, Zod schemas, fetch clients and UI components live in `packages/*`; `apps/*` only compose and wire. (LM-001)
2. Claims about MindScript must cite `docs/MindScript-How-It-Works.md`; anything not in it is "confirm", not fact. (LM-002)

---

## Entries

### LM-001 — Put shared code in its package, never in the app
- **Seen:** 1 · 2026-09-25 · commit `585d587` (reported by the user as a recurring agent habit, 2026-09-27)
- **What went wrong:** An HTTP client, `ApiError` class and API payload interfaces were written in `apps/web/src/lib/api/http.ts` (with `axios` installed in `apps/web`), even though `@asc/api-client` exists for fetch logic and `@asc/types` / `@asc/validation` for types and schemas. Agents repeatedly place code in the app they are working in instead of the owning package.
- **Rule:** Before creating a file under `apps/*`, check the "where does it go" table in [implementation plan §4](docs/plan/implementation-plan.md#4-target-repository-structure-end-of-phase-1). Types → `@asc/types`, Zod → `@asc/validation`, fetch/SSE/Medplum clients and data hooks → `@asc/api-client`, rules → `@asc/clinical-rules`, FHIR builders → `@asc/fhir`, components → `@asc/ui`, LLM calls → `@asc/agents`. When the user says code is in the wrong place: move it, update imports, and add/adjust a lint guard.
- **How to check:** `grep -rnE "export (interface|type) |z\.object\(|from \"axios\"" apps/*/src`
- **Guarded by:** not yet — P00 T4 adds `no-restricted-imports` / `no-restricted-syntax` rules; P00 T2/T3 moves the existing code.

### LM-002 — Don't assert MindScript features without a source
- **Seen:** 1 · 2026-09-25 · product docs 01/02/05/appendix (corrected 2026-09-27, commit `cc97877`)
- **What went wrong:** Product docs stated MindScript's "Recovery Queue" was a pathology result-gap engine and that a Sign Queue and in-app fax pipeline existed. The MindScript overview shows the Recovery queue is cancelled-appointment follow-up, fax is the separate faxagnet service, and Sign Queue is not described.
- **Rule:** Cite [`docs/MindScript-How-It-Works.md`](docs/MindScript-How-It-Works.md) or MindScript source (with commit SHA) for any reuse claim; otherwise mark it *(confirm)* and add a Q-MS question in [06 §7](docs/product/06-mindscript-integration.md#7-open-questions-for-the-mindscript-team).
- **How to check:** review any diff mentioning "MindScript" for a citation or "(confirm)".
- **Guarded by:** not yet (review checklist).
