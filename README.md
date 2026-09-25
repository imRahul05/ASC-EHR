# ASC EHR

ASC EHR is a high-performance, strictly typed medical electronic health record system. It is built as a **Turborepo Monorepo** ensuring clean boundaries, code reuse, and zero duplication across the stack.

## Architecture

```mermaid
flowchart TD
    %% Node Styling Definitions
    classDef webApp fill:#3b82f6,stroke:#2563eb,stroke-width:2px,color:#fff,rx:8px,ry:8px
    classDef apiApp fill:#10b981,stroke:#059669,stroke-width:2px,color:#fff,rx:8px,ry:8px
    classDef workerApp fill:#f59e0b,stroke:#d97706,stroke-width:2px,color:#fff,rx:8px,ry:8px
    classDef packageUI fill:#8b5cf6,stroke:#7c3aed,stroke-width:2px,color:#fff,rx:8px,ry:8px
    classDef packageCore fill:#64748b,stroke:#475569,stroke-width:2px,color:#fff,rx:8px,ry:8px
    classDef packageAI fill:#ef4444,stroke:#dc2626,stroke-width:2px,color:#fff,rx:8px,ry:8px
    classDef container fill:#f8fafc,stroke:#cbd5e1,stroke-width:2px,stroke-dasharray: 5 5,color:#334155

    subgraph Apps ["Apps"]
        Web["Next.js App<br/>apps/web"]:::webApp
        API["Fastify API<br/>apps/api"]:::apiApp
        Worker["BullMQ Worker<br/>apps/worker"]:::workerApp
    end

    subgraph SharedPackages ["Shared Packages"]
        UI["@asc/ui<br/>Tailwind v4 + shadcn Base UI"]:::packageUI
        APIClient["@asc/api-client<br/>Fetch wrapper"]:::packageCore
        Types["@asc/types<br/>Shared TS Interfaces"]:::packageCore
        Validation["@asc/validation<br/>Zod Schemas"]:::packageCore
        Config["@asc/config<br/>Constants"]:::packageCore
        Agents["@asc/agents<br/>AI SDK Agents"]:::packageAI
    end

    class Apps,SharedPackages container

    Web -->|HTTP/SSE| API
    Web -.-> UI
    Web -.-> APIClient
    Web -.-> Validation
    
    API -->|Redis| Worker
    API -.-> Validation
    API -.-> Types
    API -.-> Agents

    Worker -.-> Types
    Worker -.-> Config
```

## Getting Started

To install dependencies and start the local development environment:

```sh
pnpm install
pnpm dev
```

### Key Commands

- `pnpm dev`: Starts all applications (Web, API, Worker) in development mode.
- `pnpm build`: Builds all applications and packages.
- `pnpm typecheck`: Runs strict TypeScript validation across the entire workspace.
- `pnpm lint`: Runs type-aware ESLint checks (errors on `any`, `console`, floating promises).
- `pnpm test`: Runs Vitest suites across packages.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [AGENTS.md](AGENTS.md) for strict contribution rules and project conventions.
