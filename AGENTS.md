# ASC EHR - Agent Knowledge Base

Welcome. This is the central entry point for AI agents working in this monorepo.
To keep this file intentionally minimal and extensible, all detailed guidance, rules, and workflows are categorized into separate documents.

**CRITICAL INSTRUCTION:** You MUST consult the relevant documentation below *before* starting work when your task matches these categories.

## 📚 Agent Guidance Directory

### 1. Monorepo Architecture & Conventions
**Consult when:** Creating new apps/packages, modifying shared code, or adding dependencies.
👉 [Read Architecture Guidelines](docs/agent/architecture.md)
*(Includes rules on anti-duplication, Turborepo boundaries, and stack conventions).*

### 2. Agent Orchestration & Planning
**Consult when:** Tackling complex tasks, planning parallel work, or deciding whether to use sub-agents.
👉 [Read Orchestration Guide](docs/agent/orchestration.md)
*(Covers task decomposition, sub-agent coordination, and execution modes).*

### 3. Compliance, HIPAA, and PHI
**Consult when:** Handling sensitive health data, writing logging logic, or building database/API schemas.
👉 [Read Compliance & PHI Handling](docs/COMPLIANCE_AND_PHI.md)

### 4. Environments & Deployment
**Consult when:** Modifying environment variables, build steps, or deployment configurations.
👉 [Read Environment Strategy](docs/ENVIRONMENTS_AND_DEPLOYMENT.md)

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

### 8. Product Requirements & Target Architecture (GI ASC)
**Consult when:** Building any clinical feature, choosing between Medplum / MindScript reuse / new code, or modelling FHIR data.
👉 [Read Product Requirements & Architecture](docs/product/README.md)
*(Covers phased requirements, build/reuse/Medplum matrix, target architecture, end-to-end Mermaid flows, delivery plan).*
