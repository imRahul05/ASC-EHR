# Agent Orchestration Guide

This guide outlines how AI agents should plan, decompose, and execute complex tasks within the repository.

## 1. Task Classification
Before executing a task, classify it to determine the right approach:
- **Trivial/Atomic**: Single-file changes, small bug fixes, or quick answers. (Work directly inline).
- **Moderate**: Multi-file changes within the same app/package. (Work directly, but generate a plan first).
- **Complex/Cross-Cutting**: Spans frontend, backend, database, and infrastructure. (Decompose and consider sub-agents).

## 2. Direct Work vs. Sub-Agents
- **Work Directly**: For most routine tasks, keeping context in a single agent session is more efficient.
- **Use Sub-Agents**: Delegate to sub-agents (e.g., `research`, `code-reviewer`, `security-auditor`) when:
  - The task requires a deep, parallel investigation without cluttering your main context.
  - A specialized review is necessary (e.g., a comprehensive security audit of a new auth flow).
  - You need to execute fully independent parallel tasks (e.g., writing tests while you implement the UI).

## 3. Automatic Skill Selection
- Always check available skills (e.g., `adr-skill`, `git-workflow-and-versioning`) before inventing a custom approach.
- If a relevant skill exists, you MUST read its `SKILL.md` instructions using `view_file` (or follow its prompt instructions) before proceeding.

## 4. Complex-Task Decomposition & Parallelization
- Break down large features into independently testable steps.
- **Dependency Planning**: Identify what must happen first (e.g., shared types/Zod schemas must be defined before API routes or UI components).
- **Parallelization**: If Steps B and C depend only on Step A, you can execute them concurrently (via sub-agents or asynchronous commands) once Step A is complete.

## 5. Plan Generation
For any non-trivial task:
1. Write out the plan in a `<scratchpad>` or `artifact`.
2. **Dependency Matrix**: You MUST include an explicit Dependency Matrix in your plan showing which tasks block other tasks (e.g., Task A blocks Task B & C).
3. Review the plan against `docs/agent/architecture.md` and `docs/COMPLIANCE_AND_PHI.md`.
4. Iterate on the plan if dependencies or boundaries are violated.

## 6. Confirmation vs. Autonomous/Auto Mode
- **Confirmation**: If a step involves irreversible actions (e.g., database schema drops, deleting files) or ambiguous architectural choices, ask the user for confirmation first.
- **Autonomous**: For standard feature implementation following an agreed-upon plan, proceed autonomously to minimize user interruption, but summarize your progress frequently.

## 7. Sub-Agent Coordination & Verification
- When using sub-agents, give them clear, constrained prompts.
- Do not let a sub-agent "guess" the architecture; provide them with the necessary boundaries or point them to this `docs/agent/` folder.
- Always verify the output of a sub-agent (e.g., via a diff review or running tests) before considering that sub-task complete.
