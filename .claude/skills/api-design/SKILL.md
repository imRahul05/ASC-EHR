---
name: fastify-api-engineering
description: Design, build, refactor, review, and test production-grade Fastify APIs in TypeScript. Use for API architecture, route/module separation, HTTP method and endpoint design, streaming/SSE, validation, error handling, authorization, observability, performance, and scalable deployments.
license: MIT
compatibility: Fastify 5.x, TypeScript, Node.js. Check the repository's actual runtime and package versions before using APIs or suggesting upgrades.
metadata:
  author: OpenAI
  version: "1.0.0"
---

# Fastify API Engineering

## Mission

Guide the agent to build APIs that are **easy to understand, correct by contract, safe, testable, debuggable, and scalable**. Optimize for maintainability and operational clarity first, then measure and optimize performance where evidence shows it is needed.

This is an engineering skill, not a rule to rewrite every project into one preferred architecture. Inspect the repository first and follow its established conventions unless they create a concrete correctness, security, reliability, or maintenance problem.

## Operating rules

1. **Inspect before editing.** Read `package.json`, lockfile, TypeScript config, lint/test scripts, Fastify bootstrap, plugins, route registration, existing schemas, error handling, and representative tests. Identify the installed Fastify major version and module system. Do not assume the latest API is available in the repository.
2. **Describe the contract before implementing.** For a new or changed API, state method, path, caller, auth/authorization, request shape, response shape, status codes, side effects, idempotency, pagination, and streaming requirements.
3. **Follow the existing architecture where sound.** Do not introduce controllers, repositories, dependency-injection frameworks, an event bus, CQRS, or microservices as ceremony. Introduce boundaries where they separate responsibilities or make tests/reuse materially better.
4. **Make small, cohesive changes.** Prefer one feature or one logical concern per change. Avoid unrelated formatting, mass renames, broad abstractions, or large commits. Explain material trade-offs.
5. **Use current official Fastify docs when uncertain.** Do not rely on memory for version-sensitive APIs, plugin compatibility, timeout defaults, or security behavior.
6. **Do not claim verification that was not run.** Run the relevant typecheck, lint, unit/integration tests, and build where available. Report exact commands and failures.

## Default engineering principles

- Keep HTTP concerns at the edge; keep business rules independent of Fastify request/reply objects.
- Make inputs and outputs explicit. Validate untrusted input at boundaries and constrain output shapes.
- Prefer named, typed functions over large inline route handlers.
- Fail predictably with stable error codes and safe messages. Keep stack traces, SQL, vendor errors, secrets, and PHI out of client responses and normal logs.
- Avoid hidden state in process memory for anything that must survive restarts or work across replicas.
- Make side effects observable and safe to retry where appropriate. Never assume a request or message runs exactly once.
- Prefer the simplest architecture that meets real requirements. Do not optimize based on intuition alone; benchmark hotspots.

## 1. Design the API before designing the files

For each endpoint, answer these questions:

- **Resource or operation?** Prefer resource-oriented URLs and standard HTTP methods for CRUD. Use action-style subresources for genuine commands that do not map cleanly to CRUD (for example, `POST /jobs/{id}/cancel`).
- **Semantics:** What changes, what stays read-only, and what should be safe or idempotent to retry?
- **Contract:** Which query, path, header, and body fields are allowed? Which are required? What are the response DTOs and status codes?
- **Authorization:** Who can call it, for which tenant/facility/resource, and which object-level checks are required?
- **Failure modes:** Invalid input, missing resource, conflict, unauthenticated, forbidden, throttled, dependency unavailable, timeout, and partial/stream failure.
- **Scale and lifecycle:** Can this take a long time? Can the client disconnect? Is it a synchronous operation, a stream, or a background job?
- **Compatibility:** Will existing clients continue to work? Is a versioning or deprecation plan needed?

Prefer predictable conventions:

- `GET /v1/patients/:patientId` reads a representation.
- `POST /v1/patients` creates a resource or starts a defined operation.
- `PATCH /v1/patients/:patientId` applies a partial update.
- `DELETE /v1/patients/:patientId` deletes or deactivates according to the documented contract.
- Use plural resource names, stable identifiers, documented pagination, and consistent error bodies.
- Use correct status codes (`201` for a created resource, `202` for accepted asynchronous work, `204` for a successful no-content response, `400` for malformed/invalid requests, `401` for unauthenticated, `403` for unauthorized, `404` for missing/inaccessible resources when appropriate, `409` for conflicts, `422` only when project conventions call for it, `429` for throttling, and `5xx` for server/dependency failures).
- Do not expose database models as public API DTOs by default. Public contracts and persistence schemas evolve for different reasons.
- Pagination must be bounded. Specify stable ordering; use cursor pagination for large/changing datasets when offset pagination becomes expensive or unstable.
- Consider idempotency keys for retryable create/command operations that can trigger costly or externally visible side effects. Persist the key and result with a defined scope and retention policy.

## 2. The route/path/method/streaming decision

**Do not confuse one URL path with one HTTP operation.** The route is matched using the HTTP method and path (plus any configured constraints). Fastify can register several methods for a path, but that capability is not a reason to hide different semantics inside a giant `if (request.method === ...)` handler.

Use this decision process:

1. Same resource path, different HTTP semantics (for example `GET /widgets` and `POST /widgets`): register method-specific handlers. Reuse schemas, policies, and service functions when appropriate.
2. Same operation and same input, with the caller choosing JSON or a stream: consider **content negotiation** using `Accept`, such as `application/json` versus `text/event-stream`. Document both response modes and test them separately.
3. Different operation, authorization, validation, or lifecycle: use distinct route registrations, even if a part of the path is the same.
4. Browser `EventSource` clients typically require a GET subscription endpoint. A `fetch()` client can POST a body and consume a streamed response. Choose based on client requirements, not a desire to reduce line count.
5. Use a dedicated `/stream` path only when it genuinely clarifies the contract, has different auth/limits/lifecycle, or client/proxy constraints make content negotiation impractical.

### The recommended reuse boundary

Share **application/service logic**, not necessarily the HTTP handler. A route should translate HTTP inputs into a use-case call and translate its result into an HTTP response. If GET, POST, and stream behavior all call the same domain operation, extract that operation into a shared service and keep each transport path small.

Good reasons to share a handler are narrow: methods have the same semantics, validation, authorization, response, and observability behavior. Otherwise, share the reusable functions and use separate route handlers.

### Streaming response requirements

For SSE or any long-lived stream:

- Define the media type, framing, event names, schema for each event, terminal event, and error contract. For SSE, use `Content-Type: text/event-stream; charset=utf-8` and frame each event with a blank line. JSON-encode event data rather than interpolating arbitrary text into the protocol.
- Send appropriate cache/proxy headers; where relevant, disable proxy buffering (for example `X-Accel-Buffering: no`) and ensure the deployed proxy/load balancer supports long-lived responses.
- Implement backpressure-aware streaming. Do not collect the full result in memory and write it in one go.
- Tie client disconnect/response close to an `AbortSignal` or equivalent cancellation path. Stop model calls, DB cursors, subscriptions, and other upstream work promptly.
- Bound stream duration and concurrent streams. Decide how idle streams send heartbeats and how they reconnect/resume if the product requires it.
- Redact user data and credentials from stream events and logs. Do not send stack traces or raw infrastructure errors to clients.
- Once headers/body are committed, normal HTTP error status codes can no longer change. Emit a documented in-band error event where still possible, log the underlying error, and clean up the stream.
- Test first event latency, ordered events, completion, failure, cancellation, and slow consumers. Test through the real proxy in environments where proxy buffering/timeouts matter.
- Do not assume ordinary JSON response schemas will validate a stream. Validate event payloads at the point they are produced.

### Illustrative pattern: one operation, negotiated JSON or SSE

Use this only when JSON and SSE are two representations of the **same operation** with the same request contract. The names below are illustrative; use the project's actual schemas and service APIs.

```ts
import { Readable } from 'node:stream';
import type { FastifyPluginAsync } from 'fastify';

const chatRoutes: FastifyPluginAsync = async (app) => {
  app.post('/', {
    schema: {
      body: chatRequestSchema,
      // This response schema describes the JSON representation.
      // Stream event payloads must be validated when they are produced.
      response: { 200: chatResponseSchema },
    },
  }, async (request, reply) => {
    const acceptsSse = request.headers.accept
      ?.split(',')
      .some((part) => part.split(';', 1)[0].trim().toLowerCase() === 'text/event-stream') ?? false;

    if (!acceptsSse) {
      return chatService.complete(request.body);
    }

    const controller = new AbortController();
    const abortIfClientDisconnects = () => {
      if (!reply.raw.writableEnded) {
        controller.abort(new Error('Client disconnected'));
      }
    };
    reply.raw.once('close', abortIfClientDisconnects);

    const stream = Readable.from((async function* () {
      try {
        for await (const event of chatService.stream(request.body, {
          signal: controller.signal,
        })) {
          // Validate `event` before serialization if it is not already
          // guaranteed by the typed/validated service boundary.
          yield `data: ${JSON.stringify(event)}\n\n`;
        }
        if (!controller.signal.aborted) {
          yield `event: done\ndata: {}\n\n`;
        }
      } catch (error) {
        request.log.error({ err: error }, 'Chat stream failed');
        if (!controller.signal.aborted) {
          // Deliberately safe public error; never send the exception itself.
          yield `event: error\ndata: ${JSON.stringify({ code: 'STREAM_FAILED' })}\n\n`;
        }
      } finally {
        reply.raw.off('close', abortIfClientDisconnects);
      }
    })(), { objectMode: false });

    return reply
      .type('text/event-stream; charset=utf-8')
      .header('cache-control', 'no-cache, no-transform')
      .header('x-accel-buffering', 'no')
      .send(stream);
  });
};
```

Review this pattern rather than copying blindly: confirm the installed Fastify/Node versions, streaming service cancellation semantics, proxy behavior, auth and rate limits, and the client's protocol. If JSON and streaming modes have different authorization, inputs, or side effects, register separate routes instead and share the service layer. If a browser `EventSource` client is required, use a GET subscription endpoint; it cannot submit an arbitrary POST body.

For long-running work that must reliably finish even after the client disconnects, prefer a durable job: accept the command, return `202` with a job ID, and expose status/result/events separately. A client-held stream should not be the only durable record of work.

## 3. Recommended application structure

Use a **feature/domain-first** structure. Keep a small app-composition layer and group code by business capability. Adapt names to the repository; this is a default, not a mandatory tree.

```text
src/
  app.ts                    # Build the Fastify instance; do not listen here
  server.ts                 # Process entry point, listen and shutdown
  config/
    env.ts                  # Parse and validate environment variables once
  plugins/
    database.ts             # DB client/pool and lifecycle
    auth.ts                 # Authentication primitives/decorators
    observability.ts        # request context, metrics/tracing setup
    security.ts             # CORS/rate limits/headers as required
  modules/
    patients/
      patients.routes.ts    # HTTP registration and route-level schemas
      patients.schemas.ts   # contracts and inferred types (if not colocated)
      patients.service.ts   # use cases/business rules
      patients.repository.ts# persistence queries (only if useful)
      patients.errors.ts    # module-specific typed errors (when needed)
      index.ts              # public module registration/export
    chat/
      chat.routes.ts
      chat.schemas.ts
      chat.service.ts
      chat.stream.ts        # stream framing/cancellation when non-trivial
      index.ts
  shared/
    errors/
    pagination/
    types/
  test/
```

### Boundary rules

- **`app.ts`:** creates/configures Fastify, registers global plugins and feature plugins, and returns the instance. It should be importable by tests without opening a port.
- **`server.ts`:** loads configuration, creates the app, starts listening, installs graceful shutdown signals, and sets process-level failure behavior.
- **Routes/handlers:** define method, URL, schema, hooks, and status/headers. Parse no business rules inline. Call a named service function.
- **Services/use cases:** own business logic, invariants, transaction boundaries, orchestration, and application decisions. Prefer input/output types that do not depend on `FastifyRequest` or `FastifyReply`.
- **Repositories:** own persistence-specific reads/writes when they clarify data access or isolate complex queries. Do not create an interface and one-line wrapper for every simple query without a reason.
- **Plugins:** compose shared capabilities such as database connections, auth, metrics, and scoped route modules. Use Fastify's plugin/encapsulation model intentionally so hooks/decorators apply only where expected.
- **Schemas/DTOs:** define public request/response contracts. Keep domain model, API DTO, and database row concepts separate when they differ materially.
- **Shared utilities:** only place code here when it is genuinely shared and stable. Avoid a generic `utils.ts` dumping ground.

### Example module registration

```ts
import type { FastifyPluginAsync } from 'fastify';
import { listPatients } from './patients.service.js';

const patientsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', {
    schema: {
      // Add explicit querystring and response schemas in real routes.
    },
  }, async (request) => {
    return listPatients({ /* map validated inputs here */ });
  });
};

export default patientsRoutes;
```

Register with a prefix from the composition layer, for example `app.register(patientsRoutes, { prefix: '/v1/patients' })`. Use the project's actual import convention and schema strategy. This snippet illustrates the boundary, not a complete endpoint.

## 4. Fastify plugins, encapsulation, hooks, and decorators

- Prefer native Fastify plugins and hooks over generic middleware when they meet the need.
- Register dependencies before plugins/routes that consume them. Make startup order explicit and fail startup if a required dependency cannot initialize.
- Use encapsulation deliberately: a plugin can apply routes, hooks, schemas, and decorators within its scope and descendants. Avoid accidentally registering auth, CORS, or request hooks at a scope broader/narrower than intended.
- Keep plugins focused: one concern, clear inputs/configuration, clear lifecycle ownership, and tests. Do not create a plugin for a trivial pure function.
- Decorate Fastify/request/reply only for stable capabilities needed by routes. Avoid attaching per-request mutable state to a shared server-level decorator. Initialize request-scoped state per request.
- Use hooks for cross-cutting lifecycle work (authentication, request context, metrics), not as hidden places for domain workflows.
- Choose hook timing consciously: early request hooks for request context/rate limiting, `preHandler` for authorization checks that need validated input, and response/error hooks for observability. Avoid DB lookups in initial schema validation; validate shape first, then perform asynchronous business checks in service/pre-handler logic.
- Avoid duplicate auth checks or hidden security side effects scattered across hooks. Document the boundary and test that unauthenticated and unauthorized calls fail.
- Remember that low-level response hijacking changes Fastify's normal lifecycle. Use it only when necessary and understand which hooks/serialization behavior are bypassed.

## 5. Validation, serialization, and TypeScript

- Validate **path params, query strings, headers, and bodies**. Do not trust TypeScript types to validate runtime input.
- Define response schemas for JSON endpoints where feasible. They document contracts and can improve serialization performance while preventing accidental field leakage.
- Avoid `any`, unchecked casts, and duplicate handwritten request types that drift from runtime schemas.
- Choose one schema strategy that fits the repo and use it consistently. Fastify supports JSON Schema and Type Providers; official providers include `json-schema-to-ts`, TypeBox, and Zod. If the repository uses Zod, confirm the installed Fastify-compatible provider/compiler version and configure validation/serialization consistently. Do not introduce multiple competing schema systems without a concrete need.
- Reuse named schemas where contracts truly match, but don't force distinct operations into a single overly permissive schema.
- Reject unknown or invalid input according to a clear contract. Normalize/coerce only intentionally; date/time, currency, IDs, and booleans need explicit parsing rules.
- Validate environment variables at startup. Do not let missing secrets, invalid URLs, or malformed numeric limits fail unpredictably mid-request.
- Treat schemas as trusted source code only. Never compile schemas supplied by an untrusted user. Avoid asynchronous database access during initial payload validation.
- Never blindly spread request bodies into ORM create/update calls. Map allowed fields explicitly to prevent mass assignment.

## 6. Error handling and response contracts

Create one consistent error envelope unless the project already has a standard. A reasonable shape is:

```json
{
  "error": {
    "code": "PATIENT_NOT_FOUND",
    "message": "The requested patient was not found",
    "requestId": "..."
  }
}
```

Rules:

- Use typed/domain errors for expected business outcomes (not found, conflict, invalid state, policy failure) and map them centrally to HTTP responses.
- Keep unexpected exceptions as `500`; log the full error internally with request ID and useful context, but return a safe generic message.
- Never return stack traces, SQL, file paths, secrets, internal URLs, vendor payloads, or PHI as an error message.
- Preserve cause chains for debugging. Avoid catch-and-ignore and generic `throw new Error('failed')` when a stable typed error would help.
- Do not return `200` with `{ success: false }` for ordinary failures unless an explicit protocol requires it.
- Make partial-failure behavior explicit, especially when a request creates multiple related resources or calls third-party services. Use transactions, compensating actions, idempotency, or durable jobs as appropriate.
- Set status codes and headers intentionally. Avoid sending twice, swallowing promise rejections, or mixing manual `reply.send()` with a return value in a way that triggers duplicate response behavior.
- If a response has started streaming, don't try to replace it with a standard JSON error body. Use the stream's error event/framing and terminate cleanly.

## 7. Security and privacy by default

- Separate authentication (who is calling) from authorization (what they may access). Check authorization for the specific resource/action, not only the route.
- Enforce tenant/facility scoping in server-side queries and writes. Never trust a tenant ID from the body/header without binding it to the authenticated principal and policy.
- Use least-privilege database credentials and explicit transaction boundaries. Protect against IDOR, mass assignment, injection, and cross-tenant reads.
- Set request-body, upload, timeout, and rate limits according to the endpoint's risk and workload. Bound array sizes, pagination, filters, and expensive operations.
- Configure CORS for known browser origins; CORS is not authentication. Use a security-header plugin when appropriate.
- Configure trusted proxies explicitly. Do not trust arbitrary `X-Forwarded-*` headers or enable unrestricted proxy trust when the origin may be reached directly.
- Use secure cookie/session settings when applicable; protect cookie-authenticated state-changing requests against CSRF as the architecture requires.
- Store secrets in the approved secret manager/environment, never in source, tests, logs, or agent output.
- Redact authorization headers, cookies, tokens, passwords, connection strings, and sensitive medical/financial identifiers in logs. For healthcare/PHI systems, log the minimum necessary metadata and use audit trails designed for compliance rather than relying solely on application debug logs.
- Apply throttling to login, verification, search, stream, and costly AI/third-party operations. Consider per-user/tenant limits and concurrency limits in addition to IP limits.
- Keep dependencies updated, check plugin compatibility with the installed Fastify major, and run dependency/security audits consistent with the repository.

## 8. Database, concurrency, and reliable side effects

- Reuse a properly configured connection pool; do not open a new DB client per request.
- Close DB clients, queue connections, timers, and workers during Fastify shutdown using owned lifecycle hooks.
- Put related writes in a database transaction when the invariant requires atomicity. Know that transactions do not automatically solve races across multiple processes or services; use unique constraints, conditional writes, row locks, or durable distributed coordination as appropriate.
- Never rely on a process-local `Map`, mutex, or in-memory queue for correctness across horizontally scaled replicas.
- Handle uniqueness and concurrency conflicts as known domain outcomes rather than unexplained `500`s.
- Use query timeouts and reasonable pool limits. Avoid N+1 access, unbounded result sets, unbounded `Promise.all`, and holding transactions open while waiting on slow remote APIs.
- Add caching only with a clear invalidation and tenant-isolation strategy. Cache keys must incorporate all relevant authorization/tenant/context dimensions.
- For third-party calls, set timeouts, classify retryable errors, use bounded retries with backoff/jitter, and avoid retrying non-idempotent operations unless protected by idempotency keys.
- Put reliable background work in a durable queue/job system. Store job state and outcomes so users can recover from network drops and service restarts.

## 9. Streaming, long tasks, and cancellation

A streaming endpoint is a resource-intensive connection, not just a loop that calls `write()`.

- Model cancellation using `AbortSignal`; pass it through to supported DB, model, fetch, and service APIs.
- Watch the response/socket close event and abort upstream work if the client goes away before normal completion. Handle normal completion separately from a premature close.
- Use a stream/async iterator with backpressure rather than accumulating output. Respect the semantics of `reply.send(stream)` and the installed Node/Fastify version.
- If using `reply.raw` or `reply.hijack()`, own flushing, close, error, cleanup, and lifecycle implications explicitly; avoid bypassing Fastify's response lifecycle casually.
- Bound concurrent streams per process/user/tenant and choose server, proxy, and load-balancer idle timeouts deliberately. Ensure readiness/shutdown behavior doesn't strand streams.
- Send heartbeats only if required by the deployment/client protocol. Keep them small and do not count them as domain progress.
- Consider resumability using event IDs/cursors when clients must recover after disconnect. Do not promise replay semantics unless event storage supports it.
- Do not rely on stream transport to be the sole source of truth for irreversible actions or long-running work.

## 10. Observability and debuggability

- Use Fastify's Pino logger consistently (`request.log` inside request context). Prefer structured fields over string concatenation.
- Preserve a request/correlation ID end-to-end where possible. If callers can supply IDs, validate or replace malformed values and never use them as authorization proof.
- Log one concise completion/error record per request, with method, route template, status, duration, request ID, and safe actor/tenant identifiers as policy allows. Avoid logging full bodies by default.
- For external calls, record dependency name, duration, outcome, retry count, and trace/correlation information without sensitive payloads.
- Distinguish expected business rejection from unexpected server errors in logs and metrics.
- Add metrics for request rate, latency percentiles, status/error rate, event-loop/resource saturation, pool wait time, queue depth, stream count/duration/cancellation, and external dependency failures according to operational needs.
- Use distributed tracing when cross-service latency/failure diagnosis justifies it. Avoid high-cardinality labels such as patient IDs, user IDs, arbitrary URLs, or request IDs in metrics.
- Provide health endpoints with clear semantics: liveness should indicate whether the process can run; readiness should indicate whether it can safely receive traffic. Do not expose secret/config details or make every health probe perform expensive deep dependency checks.
- Include enough safe context to debug a failure without reproducing the issue in production. For sensitive healthcare systems, follow the approved PHI audit policy separately.

## 11. Performance and scaling

- Benchmark representative endpoints and realistic payloads before and after performance changes.
- Define response schemas for JSON endpoints where practical; Fastify can use them for efficient serialization.
- Prefer simple/static or simple parameterized routes on hot paths. Avoid needless regex routes, repeated work, excessive middleware layers, and repeated per-request initialization.
- Keep the application stateless across replicas. Externalize shared session, lock, queue, and rate-limit state when correctness depends on all instances agreeing.
- Use a reverse proxy/load balancer for TLS termination, routing, connection handling, and horizontal scaling according to the deployment architecture. Configure proxy trust narrowly.
- Set body limits, request timeouts, handler/dependency timeouts, pool limits, and graceful shutdown consistently across the app and its infrastructure.
- Avoid synchronous CPU-heavy work on the event loop. Move long CPU-bound jobs to worker threads or a separate worker service where warranted.
- Use backpressure and bounded concurrency for downstream dependencies. A fast HTTP server can still overload the database or AI provider if requests are unlimited.
- Add horizontal scaling only after checking sticky state, scheduled jobs, WebSockets/streams, distributed rate limits, migrations, and shutdown behavior.
- Don't chase a benchmark number at the cost of readability or correctness. Record the bottleneck and measurement.

## 12. Testing strategy

Build the app through a factory and use `fastify.inject()` for most route integration tests. It exercises routing and lifecycle without requiring a listening socket and waits for registered plugins to boot.

For a meaningful endpoint, cover:

- Success response: status, headers, body shape, and important side effects.
- Schema errors: invalid body, params, query, missing fields, bad enum/format, unknown fields when rejected.
- Authentication and authorization: unauthenticated, wrong role, wrong tenant/facility, wrong resource ownership.
- Not-found/conflict/duplicate/retry behavior and database transaction outcomes.
- Error handler output: stable public error, no internal detail leakage, logs/trace context where testable.
- Pagination, boundary limits, sorting, and filter behavior.
- Streaming: content type, first chunk, event framing/order, completion, error event, client abort, cancellation propagation, and cleanup. If proxy buffering is relevant, add deployment-level tests.
- Dependency failure/timeout and graceful shutdown where material.
- Contract compatibility for public endpoints and generated OpenAPI output.

Keep layers testable:

- Unit-test services/domain rules without Fastify when practical.
- Use `fastify.inject()` for route, schema, hook, and error behavior.
- Use integration tests with real or controlled database/dependency infrastructure for transactions, constraints, race conditions, and persistence.
- Mock only boundaries whose behavior is not the subject of the test. Do not mock away the concurrency or serialization property being verified.
- Include regression tests for bugs and races; a passing typecheck alone is not evidence of runtime correctness.

## 13. Documentation and API lifecycle

- Generate or maintain OpenAPI documentation using the project's established tooling (commonly `@fastify/swagger` and a UI plugin where desired).
- Keep the API contract close to route schemas and review it as source code.
- Document authentication scopes, status codes, pagination defaults/maxima, idempotency behavior, stream protocol, retry behavior, and deprecation guarantees.
- Avoid breaking changes in-place. Version only when needed by compatibility requirements and define rollout/deprecation steps.
- Provide examples that are tested or mechanically checked where feasible.

## 14. Suggested code-review checklist

Before declaring an API change complete, inspect:

### Design
- [ ] Method/path semantics are clear; there is no giant method-switch handler without a strong reason.
- [ ] Route and service boundaries are appropriately separated.
- [ ] Status codes, pagination, idempotency, and compatibility are specified.

### Runtime correctness
- [ ] All external inputs are runtime-validated.
- [ ] JSON outputs have explicit schemas/DTOs where practical.
- [ ] Error mapping is consistent and safe.
- [ ] Async failures are awaited/handled; no duplicate response or unhandled background promise.

### Security/privacy
- [ ] Authentication and resource/tenant authorization are enforced.
- [ ] Body/query/result sizes and expensive operations are bounded.
- [ ] Logs and errors do not leak secrets or PHI.
- [ ] Proxy trust, CORS, rate limiting, and dependency versions are appropriate.

### Reliability and scale
- [ ] DB connections and external resources are reused and closed correctly.
- [ ] Concurrency invariants work across multiple instances.
- [ ] Timeouts, retries, transaction scope, and partial failures are explicit.
- [ ] Streams honor backpressure and cancellation.

### Verification
- [ ] Relevant unit/integration/stream tests pass.
- [ ] Typecheck, lint, and build pass where available.
- [ ] OpenAPI/contracts and migration/operational notes are updated when needed.
- [ ] The final report lists what changed, what ran, what failed, and unresolved risks.

## 15. Required workflow when the agent is asked to build an API

1. **Reconnaissance:** inspect repository conventions, installed versions, existing route modules, test commands, and any documented architecture.
2. **Contract:** write a short endpoint contract (method/path, input, output, errors, auth, side effects, streaming or async behavior).
3. **Plan boundaries:** identify route/schema/service/repository/plugin changes. Explain why each boundary is needed; avoid ceremony.
4. **Implement:** add typed schemas and small handlers; keep domain logic testable and dependency operations bounded.
5. **Test:** add happy-path, validation, authorization, error, and concurrency/stream tests appropriate to the change.
6. **Verify:** run focused tests first, then typecheck/lint/build or the repo's equivalent. Inspect the final diff for accidental changes.
7. **Report:** summarize contract and architecture decisions, tests run with results, operational notes, and remaining uncertainty. Never state that a command passed unless it actually passed.

## Reference links (official or primary sources)

Use these as the authoritative starting points; verify the docs for the project's installed version.

- [Fastify Reference](https://fastify.dev/docs/latest/Reference/)
- [Routes](https://fastify.dev/docs/latest/Reference/Routes/)
- [Plugins](https://fastify.dev/docs/latest/Reference/Plugins/)
- [Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/)
- [Hooks](https://fastify.dev/docs/latest/Reference/Hooks/)
- [Lifecycle](https://fastify.dev/docs/latest/Reference/Lifecycle/)
- [Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/)
- [Type Providers (JSON Schema / TypeBox / Zod)](https://fastify.dev/docs/latest/Reference/Type-Providers/)
- [Reply and streams](https://fastify.dev/docs/latest/Reference/Reply/)
- [Errors](https://fastify.dev/docs/latest/Reference/Errors/)
- [Logging](https://fastify.dev/docs/latest/Reference/Logging/)
- [Testing](https://fastify.dev/docs/latest/Guides/Testing/)
- [Recommendations and production deployment](https://fastify.dev/docs/latest/Guides/Recommendations/)
- [Detecting client aborts](https://fastify.dev/docs/latest/Guides/Detecting-When-Clients-Abort/)
- [Ecosystem plugins](https://fastify.dev/docs/latest/Guides/Ecosystem/)
- [Fastify project charter](https://github.com/fastify/fastify/blob/main/PROJECT_CHARTER.md)
