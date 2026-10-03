# ASC EHR - Agent Knowledge Base

Welcome. This is the central entry point for AI agents working in this monorepo.
To keep this file intentionally minimal and extensible, all detailed guidance, rules, and workflows are categorized into separate documents.

**CRITICAL INSTRUCTION:** You MUST consult the relevant documentation below *before* starting work when your task matches these categories.

## ⚡ Session protocol (MANDATORY for every coding agent)

1. **Read first:** [`LEARNING_MISTAKES.md`](LEARNING_MISTAKES.md) (mistakes already corrected — do not repeat them) and [`PROGRESS.md`](PROGRESS.md) (what is done / in progress / next).
2. **Pick work from the plan:** [`docs/plan/implementation-plan.md`](docs/plan/implementation-plan.md) → the phase file in [`docs/plan/phases/`](docs/plan/phases/). Only start a phase whose dependencies are `done`.
3. **Respect package boundaries:** use the "where does it go" table in the plan §4. Code, types and schemas go in their owning `packages/*`, never in `apps/*`.
4. **On finish:** update `PROGRESS.md` (status, PR, next up) in the same branch.
5. **When corrected** by the user, a reviewer, lint or tests: fix it **and** add or update an entry in `LEARNING_MISTAKES.md` in the same commit.

## 📚 Agent Guidance Directory

### 1. Monorepo Architecture & Conventions
**Consult when:** Creating new apps/packages, modifying shared code, or adding dependencies.
👉 [Read Architecture Guidelines](docs/agent/architecture.md)
👉 [Read UI Guidelines](docs/agent/ui-guidelines.md) — *any change in `apps/web` or `packages/ui`: layers, data hooks, SSE/realtime, AI draft UX, clinical UX, PHI in the browser.*
*(Includes rules on anti-duplication, Turborepo boundaries, and stack conventions).*

### 2. Agent Orchestration & Planning
**Consult when:** Tackling complex tasks, planning parallel work, or deciding whether to use sub-agents.
👉 [Read Orchestration Guide](docs/agent/orchestration.md)
*(Covers task decomposition, sub-agent coordination, and execution modes).*

### 3. Compliance, HIPAA, and PHI
**Consult when:** Handling sensitive health data, writing logging logic, or building database/API schemas.
👉 [Read Compliance & PHI Handling](docs/COMPLIANCE_AND_PHI.md)
👉 [Read Identity, Access & Multi-Tenancy design](docs/product/08-identity-access-and-tenancy.md) — *auth, roles/capabilities, tenant isolation, realtime and service-to-service security.*

### 4. Environments & Deployment
**Consult when:** Modifying environment variables, build steps, or deployment configurations.
👉 [Read Environment Strategy](docs/ENVIRONMENTS_AND_DEPLOYMENT.md)
👉 [Read Deployment Configuration](docs/DEPLOYMENT_CONFIGURATION.md) — *API URL, CORS origins, demo mocking: local, Vercel and Azure setups, verification, troubleshooting.*

### 5. Architectural Decisions (ADRs)
**Consult when:** You need historical context on why a technical decision was made.
👉 [Browse ADRs](docs/decisions/README.md)
### 6. Incremental Commits & Checkpoints
**Consult when:** Executing long-running or multi-step tasks to maintain a clean git history.
👉 [Read Incremental Commits Guide](docs/agent/incremental-commits.md)
*(Covers atomic commits, proactive checkpointing, and commit hygiene).*

### 7. AI Agents & LLM Calls
**Consult when:** Adding any AI feature, creating or changing an agent or prompt, changing which model runs, or calling an LLM from any app.
👉 [Read AI Agents Guide](docs/agent/ai-agents-guide.md)
*(Covers when to create an agent, step-by-step recipes, runAgent usage, config-only changes, MUST/MUST NOT rules, troubleshooting, PR checklist).*
Dev-time skills (`.claude/skills/`, never loaded at runtime): `create-agent`, `change-agent-prompt`, `add-model`, `phi-review`.
👉 [Read Memory, Skills & Modern Techniques](docs/agent/memory-skills-and-modern-techniques.md)
*(Proposal: where agent memory lives, runtime vs dev-time skills, caching/effort/batch/evals, roadmap).*
👉 [Read Agent Platform Action Plan](docs/agent/agent-platform-action-plan.md) — *prioritised changes from the proposal + [review](docs/agent/memory-skills-proposal-review.md); start here.*
👉 [Read Memory Tools Evaluation](docs/agent/memory-tools-evaluation.md) — *Mem0, Langfuse, Supermemory: what fits the PHI/gateway architecture (adopt Langfuse for evals/tracing; no external clinical memory).*

### 8. Product Requirements & Target Architecture (GI ASC)
**Consult when:** Building any clinical feature, choosing between Medplum / MindScript reuse / new code, or modelling FHIR data.
👉 [Read Phase-wise Implementation Plan](docs/plan/implementation-plan.md) — *27 short phases with dependency matrices, target file tree, Medplum/npm versions; live status in [`PROGRESS.md`](PROGRESS.md).*
👉 [Read Product Requirements & Architecture](docs/product/README.md)
*(Covers phased requirements, build/reuse/Medplum matrix, target architecture, end-to-end Mermaid flows, delivery plan).*
👉 [Read MindScript — How It Works](docs/MindScript-How-It-Works.md) + [MindScript integration & wiring](docs/product/06-mindscript-integration.md) — *consult before porting anything from MindScript or wiring faxagnet / eCW (Integuru) / Deepgram.*
