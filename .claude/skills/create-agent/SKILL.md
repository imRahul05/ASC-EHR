---
name: create-agent
description: Scaffold a new LLM agent in @asc/agents end to end (Recipe A of the AI Agents Guide) - task choice, strict minimum-necessary input schema, versioned prompt, definition, registry and export, output schema in @asc/validation, synthetic evals and tests, then verify. Use when adding any new AI feature whose output a human will read or store, or that touches PHI (e.g. referral letter, procedure-note summary, coding suggestions). Not for editing an existing agent's prompt (use change-agent-prompt) or for model/routing changes (use add-model).
metadata:
  owner: engineering
  scope: dev-time
---

# create-agent

Developer-time workflow. Nothing here is loaded at runtime; runtime code must never read `.claude/`.

Source of truth: `docs/agent/ai-agents-guide.md` (sections 3-5, 9, 11) and `packages/agents/README.md`. If they disagree with this skill, the docs win - tell the user.
Template agent: `packages/agents/src/agents/discharge-instructions/` - read every file in it (including `__tests__/` and `evals/`) before starting.

## 0. Decide it really is an agent

Rule of thumb: if a human will read it, store it, or it contains PHI, it is an agent. Never import `@ai-sdk/*` or call a model SDK from an app.

Ask the user (or infer and state) before writing code:
- Agent name (kebab-case, e.g. `referral-letter`) and one-line description.
- Which facts the model truly needs (minimum necessary). Push back on names, DOB, MRN, addresses, free text.
- Who reads the output (patient, clinician, coder) - drives clinical-review needs.
- Does the web app render the output (then the output schema goes in `@asc/validation`)?

## 1. Checklist (exact paths)

`A` = `packages/agents/src`, `<name>` = kebab-case agent name.

- [ ] **Task** - reuse a `Task` in `A/config/tasks.ts` if its policy fits; otherwise add one to `Task` and `TASK_PROFILES` (`reasoning`, `handlesPhi`, `description`). Any task that works on patient data gets `handlesPhi: true`.
- [ ] **Output schema** - `packages/validation/src/agents/<name>.ts`, exported from `packages/validation/src/index.ts` following that file's current pattern (check how `dischargeInstructionsOutputSchema` is exposed today). Only if no app renders it may it live next to the input.
- [ ] **Input** - `A/agents/<name>/input.ts`: `.strict()` Zod object (nested objects `.strict()` too), closed enums, bounded ints, booleans, discriminated unions for clinician decisions. Header comment stating what is excluded and why.
- [ ] **Prompt** - `A/agents/<name>/prompt.ts`: `PROMPT_VERSION = 'YYYY-MM-DD.1'` (today's date), `INSTRUCTIONS`, `buildMessages(input)` rendering each field explicitly through lookup tables. Header comment "REQUIRES CLINICAL REVIEW BEFORE PRODUCTION USE" for clinical/patient-facing output.
- [ ] **Definition** - `A/agents/<name>/definition.ts` with `defineAgent({...})`. Add `reasoning`, `models` (pin), or `requires` only with a stated reason.
- [ ] **Index** - `A/agents/<name>/index.ts` re-exports the agent, input schema and input type.
- [ ] **Registry** - one line in `A/agents/registry.ts`: `[myAgent.name]: myAgent,` plus its import.
- [ ] **Public export** - add the agent, input schema and input type to `A/index.ts` (agents section).
- [ ] **Evals** - `A/agents/<name>/evals/cases.ts`: at least 3 synthetic `AgentEvalCase`s covering the normal path, a branch that changes clinical content, and a language/reading-level or edge variant. Each case has named `expectations` with `check(output)`.
- [ ] **Tests** - `A/agents/<name>/__tests__/<name>.test.ts` (see section 3).
- [ ] **Verify** - section 4.
- [ ] **PR note** - clinical reviewer named (section 5); run the `phi-review` skill on the diff.

Templates for every file: [references/templates.md](references/templates.md).

## 2. PHI rules (non-negotiable)

- Minimum necessary: every input field must be justified by the output. No names, DOB, MRN, addresses, phone, email, insurance ids, free text "notes". If free text is truly required, bound its length and write the justification in a comment; expect reviewer pushback.
- `buildMessages` renders individual typed fields. Never `JSON.stringify(input)`, never spread the input or a case/patient object into a template string, never `Object.entries(input)` loops.
- Derived clinical facts (e.g. "tissue sent for lab testing") are computed in code in `buildMessages`, not left to the model.
- The prompt tells the model not to include names or identifiers and to use only the provided facts.
- Internal ids (`patientId`, `surgicalCaseId`) go to `runAgent` options for audit - never into the prompt.
- Eval cases and test fixtures are synthetic. Never paste real patient data, even "de-identified", into cases, tests, comments or PR text.
- Don't log inputs, prompts, outputs or `AgentExecutionError.cause`. `runAgent` already audits; do not add your own logging of content.
- Gateway/runtime options (timeouts, retries, telemetry, provider storage, usage reporting, failure kinds) are set centrally - follow `packages/agents/README.md` for current gateway options; do not configure providers from inside an agent.

## 3. Tests to write (copy the discharge-instructions test)

Use `A/testing/fixtures.ts` (`createFixture`, `createTestGateway`, `createAuditRecorder`, `respondWith`, `failWith`, `apiError`, `callCount`). Minimum:

1. Definition has the expected `name`, `task`, `promptVersion`.
2. Strict input: extra identifier fields (`patientName`, `mrn`) fail `safeParse`.
3. `buildMessages` with smuggled `CANARY-*` identifier fields: output contains no `CANARY`, no field names, no `{` (no object dumps), and exactly N fact lines.
4. Each derived fact is correct for both branches.
5. Every eval input parses; every case has at least one expectation; expectations pass for a matching output and fail for a wrong one.
6. `runAgent` round-trip with a mocked valid output on a BAA model: output equals, `meta` has agent/promptVersion/tier/containsPhi, non-BAA model not called, one `SUCCESS` audit event whose `details` pass `sanitizeDetails` and contain no clinical text.
7. Invalid input: `AgentInputError` listing field paths only (no values), no model called, `FAILURE` audited.
8. Schema-mismatched model output and a provider error (e.g. 401) each audit `FAILURE`.

Check the fixture's tier/model ids (`a-med`, `o-med`, ...) against your task's tier before asserting on `modelId`.

## 4. Verify

```bash
pnpm -s turbo run lint check-types test --filter=@asc/agents --filter=@asc/validation
```

`validateAgentConfig()` runs inside the `@asc/agents` tests and proves the new agent can run - with a BAA model if it handles PHI - on every hosting target and routing profile. If it fails with a missing BAA/capable/hosted model, fix routing or the pin (see `add-model`), not the validator.

## 5. Before patient use

- AI output is a draft. The calling app saves it as a draft with `meta.agentExecutionId` and `meta.promptVersion`; a clinician confirms before anything is signed, sent or filed.
- Clinical review of `INSTRUCTIONS` and sample outputs from the eval cases is required before the agent is used with real patients or the medical record. Put the reviewer's name/role in the PR description; if none is known yet, write "Clinical review: PENDING - not for patient use" and tell the user.
- Wiring the agent into `apps/api` / `apps/worker` is a separate step (Recipe B in the guide).

## Report back

List files created/changed, the chosen task and why, each input field with its justification, verify command output, and the clinical-review status.
