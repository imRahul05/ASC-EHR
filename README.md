# ASC EHR

ASC EHR is a high-performance, strictly typed medical electronic health record system. It is built as a **Turborepo Monorepo** ensuring clean boundaries, code reuse, and zero duplication across the stack.

## Architecture

```mermaid
flowchart TD
    subgraph Apps ["Apps"]
        Web["Next.js App<br/>apps/web"]
        API["Fastify API<br/>apps/api"]
        Worker["BullMQ Worker<br/>apps/worker"]
    end

    subgraph SharedPackages ["Shared Packages"]
        UI["@repo/ui<br/>Tailwind v4 + shadcn Base UI"]
        APIClient["@repo/api-client<br/>Fetch wrapper"]
        Types["@repo/types<br/>Shared TS Interfaces"]
        Validation["@repo/validation<br/>Zod Schemas"]
        Config["@repo/config<br/>Constants"]
    end

    Web -->|HTTP/SSE| API
    Web -.-> UI
    Web -.-> APIClient
    Web -.-> Validation
    
    API -->|Redis| Worker
    API -.-> Validation
    API -.-> Types

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
- `pnpm lint`: Runs ESLint checks.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [AGENTS.md](AGENTS.md) for strict contribution rules and project conventions.
