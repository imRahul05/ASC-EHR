---
name: change-agent-prompt
description: Safely change what an existing @asc/agents agent says or how it reasons - edit INSTRUCTIONS or buildMessages in its prompt.ts, bump PROMPT_VERSION, update or add synthetic eval cases and tests, verify, and write the PR note for the clinical reviewer. Use whenever a diff touches packages/agents/src/agents/<name>/prompt.ts, an agent's input fields that feed buildMessages, or its output expectations. Not for creating a new agent (use create-agent) or changing which model runs (use add-model).
metadata:
  owner: engineering
  scope: dev-time
---

# change-agent-prompt

Developer-time workflow; never loaded at runtime. Source of truth: `docs/agent/ai-agents-guide.md` (section 3 "Change what an agent says", section 9 rules, section 11 PR checklist). Reference implementation: `packages/agents/src/agents/discharge-instructions/`.

`A` = `packages/agents/src/agents/<name>`.

## 1. Before editing

- Read the whole agent folder: `input.ts`, `prompt.ts`, `definition.ts`, `evals/cases.ts`, `__tests__/`.
- Write down the intended behaviour change in one sentence and which eval case(s) should prove it.
- If the change needs new data, that is an input-schema change: apply the minimum-necessary rules from `create-agent` section 2 (strict, enums/numbers/booleans, no identifiers, no free text without written justification). Removing a field is always fine; adding one needs a reason.
- If the change is really "use a stronger/different model", stop - that is config (`add-model` / Recipe C), not a prompt change. Never name a model in the prompt.

## 2. Edit

- [ ] `A/prompt.ts` - change `INSTRUCTIONS` and/or `buildMessages`.
  - Keep rendering each field explicitly via lookup tables; never `JSON.stringify(input)` or interpolate whole objects.
  - Keep derived clinical facts computed in code, not delegated to the model.
  - Keep the "use ONLY the facts provided" and "no names or identifiers" rules.
  - Clinical rules (hold days, timing thresholds, codes) belong in code or structured input, not new prose the model must remember.
- [ ] **Bump `PROMPT_VERSION`** - format `YYYY-MM-DD.N`. Same day as the current version: increment `N`. New day: today's date with `.1`. Required for ANY change to `INSTRUCTIONS` or `buildMessages`, including wording, whitespace-significant formatting and lookup-table text. `defineAgent` rejects a malformed version.
- [ ] `A/input.ts` - only if fields changed; keep `.strict()`.
- [ ] Output schema in `packages/validation/src/agents/<name>.ts` - only if the output shape changed. A shape change also affects `apps/web`/`apps/api` consumers; call it out and check them with `grep -rn "<OutputSchemaName>" apps packages`.

## 3. Evals and tests

- [ ] `A/evals/cases.ts` - add a synthetic case that exercises the new behaviour, with an expectation that would fail under the old prompt's intended behaviour. Update expectations that the change deliberately invalidates. Keep at least 3 cases. Synthetic data only.
- [ ] `A/__tests__/` - update:
  - fact-line count / expected fact strings in the `buildMessages` test when facts are added or removed;
  - `CANARY` smuggling test still passes (no identifiers, no `{`);
  - new derived-fact branches tested both ways;
  - the definition test asserts `promptVersion: PROMPT_VERSION` (imported, so no manual edit), but any hard-coded version string elsewhere must be updated.

## 4. Verify

```bash
pnpm -s turbo run lint check-types test --filter=@asc/agents --filter=@asc/validation
```

Live-model eval runs are not built yet (see `packages/agents/README.md` "Next step - live evals"); if a runner exists by the time you read this, run it for the changed agent on the budget profile with synthetic cases and include pass rates per `promptVersion`.

## 5. PR note for the clinical reviewer

Include in the PR description (no real patient data anywhere):

```markdown
### Prompt change: <agent-name>
- promptVersion: <old> -> <new>
- Why: <one sentence>
- Behaviour change: <what the patient/clinician will see differently>
- Input fields: <added/removed/unchanged, with justification for any added field>
- Output schema: <unchanged | changed - consumers updated: ...>
- Evals: <cases added/updated, by name>
- Diff of INSTRUCTIONS: <paste or link the hunk>
- Clinical review: <reviewer name/role> | PENDING - not for patient use until approved
```

Patient-facing or record-bound output needs clinical sign-off before the new version reaches real patients. If no reviewer is named, say so explicitly to the user. Run the `phi-review` skill on the diff before requesting review.
