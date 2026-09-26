---
name: phi-review
description: Review a diff for PHI leakage and HIPAA/AI-routing violations in this EHR monorepo - PHI in logs, console, errors, audit details, telemetry or Redis/BullMQ job data; patient objects serialized into prompts; free-text or identifier input fields; wrong containsPhi; @ai-sdk imports outside config/providers; process.env in @asc/agents; provider server-side storage; model-supplied patient ids in tools; real patient data in skills, knowledge, evals or fixtures. Use before opening or approving any PR that touches packages/agents, apps/api, apps/worker, logging, audit, telemetry, queues, or patient data, and after create-agent / change-agent-prompt / add-model. Outputs findings with file:line, severity and fix.
metadata:
  owner: engineering
  scope: dev-time
---

# phi-review

Developer-time review checklist; never loaded at runtime. Rules come from `docs/COMPLIANCE_AND_PHI.md` and `docs/agent/ai-agents-guide.md` section 9. This skill finds problems - it does not replace human security/compliance review.

PHI = any health information tied to an individual: names, DOB, MRN, addresses, phone/email, insurance ids, dates of service with identity, diagnoses, findings, medications, free-text notes, images. Internal opaque ids (`patientId`, `surgicalCaseId`, `agentExecutionId`) are allowed in audit/log metadata.

## 1. Get the diff

Default: `git diff --merge-base origin/main` plus untracked files (`git status --short`). Or the PR/range/files the user names. Review changed lines and enough surrounding context to judge data flow (where does this variable come from?).

Useful sweeps over changed files (adapt paths):

```bash
git diff --merge-base origin/main --name-only
grep -nE "console\.(log|error|warn|info|debug)" <files>
grep -nE "JSON\.stringify\(" <files>
grep -nE "from ['\"]@ai-sdk/|require\(['\"]@ai-sdk/" <files>
grep -nE "process\.env" <files under packages/agents>
grep -nE "containsPhi" <files>
grep -nE "\.cause|failedReason|err(or)?\.message" <files>
grep -nE "store:|previous_response_id|previousResponseId|conversation" <files>
```

Greps find candidates; confirm each by reading the code.

## 2. Checklist

| # | Check | Look for | Default severity |
|---|---|---|---|
| 1 | Logs / console | `console.*` anywhere in app code; `logger.*` calls including input, prompt, output, patient/case objects, request bodies, or `AgentExecutionError.cause` / provider error text. Must use `@asc/logger`, metadata + opaque ids only. | High (Critical if identifiers) |
| 2 | Errors | Thrown messages or HTTP error bodies interpolating field values; `AgentInputError`-style errors must list field paths only. | High |
| 3 | Audit | `@asc/audit` `details` with clinical text, prompts, outputs, names; must be primitives, routing metadata, opaque ids. Missing audit for a new PHI read/write or agent action. | High |
| 4 | Telemetry | Span attributes/events with PHI; AI SDK telemetry recording inputs/outputs; bypassing `@asc/telemetry`. | High |
| 5 | Redis / BullMQ | Job `data` carrying patient facts instead of ids (worker should re-read from the record); `failedReason`/`returnvalue` containing provider error text or output; no retention (`removeOnComplete`/`removeOnFail`). | High |
| 6 | Prompt serialization | `JSON.stringify(input|patient|case)`, template-string of whole objects, `Object.entries(input)` loops, spreading records into messages in `buildMessages`/prompt code. | Critical |
| 7 | Input schemas | Agent input not `.strict()` (nested too); name/DOB/MRN/address/phone/email fields; unbounded `z.string()` free text without a written justification; fields the output doesn't need. | High |
| 8 | `containsPhi` | Hard-coded `false` on a call built from patient data; a new task handling patient data with `handlesPhi: false`; a flag derived from something other than the actual data sent. | Critical |
| 9 | SDK boundary | `@ai-sdk/*` or vendor SDK imports outside `packages/agents/src/config/providers/`; model names/ids in app code or prompts; direct model calls bypassing `@asc/agents`. | High |
| 10 | Env reads | `process.env` inside `packages/agents` (apps build hosting from `@asc/config`). | Medium |
| 11 | BAA flag | Any change to `baa:` in `config/providers/*`; `true` requires a countersigned BAA for that endpoint, named in the PR. | Critical if unconfirmed |
| 12 | Provider storage / state | OpenAI or Azure OpenAI calls without server-side storage disabled (`store` must be false); `previous_response_id`, conversations, provider-hosted memory/threads/files, batch APIs for PHI without BAA/retention review. Check the current provider/gateway setup per `packages/agents/README.md`. | Critical |
| 13 | Tools | Tool parameters that let the model supply `patientId`/`caseId`/org scope - scope must come from run context set by code; tool results returning more than minimum necessary; write tools without approval. | Critical |
| 14 | Fixtures / evals / skills / knowledge / docs | Realistic names, DOBs, MRNs, addresses, or text that looks copied from a real chart in eval cases, tests, seed data, `SKILL.md`/knowledge packs, comments, PR text. Synthetic only; use obvious canaries (`CANARY-NAME`). | Critical if real, else Low |
| 15 | Output handling | Model output auto-signed, sent to a patient, or written to the record without clinician approval; missing `agentExecutionId`/`promptVersion` on stored drafts. | High |
| 16 | Access control | New endpoints reading PHI without authz checks or scoping by org/patient. | High |

Severity scale: **Critical** - PHI leaves the BAA boundary or is persisted/exposed in a non-PHI store, or a control is disabled; **High** - likely PHI exposure or bypass of a mandated layer; **Medium** - policy violation with limited exposure; **Low** - hygiene / defence in depth.

## 3. Output format

Report findings only (no praise), most severe first:

```markdown
## PHI review: <scope reviewed>

| # | Severity | Location | Finding | Fix |
|---|---|---|---|---|
| 1 | Critical | packages/agents/src/agents/foo/prompt.ts:42 | `buildMessages` interpolates `JSON.stringify(input.case)` - every case field, including identifiers, reaches the model | Render each allowed field explicitly; add a CANARY smuggling test |
| 2 | High | apps/worker/src/jobs/bar.ts:88 | `logger.error({ err })` logs `AgentExecutionError.cause` (provider text may echo prompt) | Log `err.name`, `agentExecutionId`, `retryable` only |

**Checked, no findings:** <checklist numbers>
**Not verifiable from the diff:** <e.g. BAA countersignature, runtime provider defaults> - needs human confirmation
**Verdict:** BLOCK (any Critical/High) | FIX BEFORE MERGE (Medium) | OK (Low/none)
```

Rules for the report:
- Every finding has an exact `path:line` from the current tree.
- Never quote PHI in the report itself - describe it ("line contains what looks like a DOB").
- If something looks like real patient data, flag it Critical and recommend removal from git history, not just a follow-up commit.
- Don't fix code unless the user asks; when asked, fix Critical/High first and re-run the review.
