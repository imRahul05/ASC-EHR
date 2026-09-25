# Architecture Decision Records (ADR)

An Architecture Decision Record (ADR) captures an important architecture decision along with its context and consequences.

## Conventions

- Directory: `docs/decisions`
- Naming:
  - Use date-prefixed files: `YYYY-MM-DD-choose-database.md`
  - If the repo already uses slug-only names, keep that: `choose-database.md`
- Status values: `proposed`, `accepted`, `rejected`, `deprecated`, `superseded`

## Workflow

- Create a new ADR as `proposed`.
- Discuss and iterate.
- When the team commits: mark it `accepted` (or `rejected`).
- If replaced later: create a new ADR and mark the old one `superseded` with a link.

## ADRs

- [Adopt architecture decision records](2026-09-25-adopt-architecture-decision-records.md) (accepted, 2026-09-25)
- [Adopt Vercel AI SDK for Agent Orchestration](2026-09-25-adopt-vercel-ai-sdk-for-agent-orchestration.md) (accepted, 2026-09-25)
- [Centralize Agent Configuration and Model Routing](2026-09-25-centralize-agent-configuration-and-model-routing.md) (accepted, 2026-09-25)
- [Multi-Environment Lifecycle and Deployment Strategy](2026-09-25-environment-lifecycle-and-deployment-strategy.md) (accepted, 2026-09-25)