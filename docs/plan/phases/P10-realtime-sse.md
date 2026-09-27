# P10 — Realtime: SSE envelope, API SSE, job progress, stream client

| Field | Value |
|---|---|
| Wave · Lane · Size | 2 · Platform · M |
| Depends on | P04 |
| Unblocks | P15, P16, P18, P19, P24 |
| Source mix | NEW (MS pattern: draft-first SSE events `generation_draft_ready`, per-step status) |
| Requirements | Latency NFR (AI draft ≤ 60 s visible progressively); [UI guidelines §5](../../agent/ui-guidelines.md#5-realtime-sse-websockets-and-streaming) |
| Branch | `phase/P10-realtime-sse` |

## Goal
One typed, resumable streaming channel: API emits SSE (AI token/section streams and worker job progress), the browser consumes it with bearer auth through one hook. Medplum WebSocket subscriptions stay the channel for FHIR data changes.

## Out of scope
Specific AI pipelines (P16/P19); whiteboard subscriptions (P15 uses Medplum WS directly).

## File structure
```text
packages/validation/src/sse/envelope.ts       NEW  SseEnvelope { id, type, ts, data } ; heartbeat ; error ; done
packages/validation/src/sse/events.ts         NEW  discriminated union registry: job.progress, job.step, ai.delta, ai.section, ai.draft_ready, job.completed, job.failed
packages/config/src/realtime.ts               NEW  HEARTBEAT_MS=15000, channel naming, max stream duration
apps/api/src/plugins/sse.ts                   NEW  reply.sseStream(schema) helper over fastify-sse-v2: heartbeat, Last-Event-ID resume, auth check, close on client abort
apps/api/src/routes/events.ts                 NEW  GET /jobs/:jobId/events (SSE) — verifies caller owns the job
apps/api/src/services/job-events.ts           NEW  subscribe Redis channel job:<id>, replay last N from Redis stream
apps/worker/src/progress.ts                   NEW  publishProgress(jobId, event) → Redis stream (XADD, capped) — IDs only, no PHI
packages/api-client/src/stream.ts             NEW  openEventStream(url, {token, schema, lastEventId}) using fetch + eventsource-parser, auto-reconnect w/ backoff
packages/api-client/src/react/use-event-stream.ts  NEW  useEventStream(url, schema) → {events, status, lastEvent, error}
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Envelope + event schemas + realtime config | `@asc/validation`, `@asc/config` | contracts |
| T2 | API SSE plugin + events route + Redis replay service | `apps/api` | route + tests (inject) |
| T3 | Worker progress publisher | `apps/worker` | module + test |
| T4 | Stream client + React hook (reconnect, resume, abort) | `@asc/api-client` | client + tests |
| T5 | Demo: fake job → progress in dev page | `apps/web` | `/dev/stream` (dev only) |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | T2, T3, T4 | — |
| T2 | T1 | T5, P19 | T3, T4 |
| T3 | T1 | T5, P19 | T2, T4 |
| T4 | T1 | T5, P16 | T2, T3 |
| T5 | T2, T3, T4 | — | — |

## Packages to add
| Package | Version | Workspace |
|---|---|---|
| `eventsource-parser` | 4.1.1 | `@asc/api-client` |
| `fastify-sse-v2` | 4.2.2 (bump from ^4.0.0) | `apps/api` |

## Acceptance
- [ ] Stream survives proxy idle timeouts (heartbeat) and resumes with `Last-Event-ID`
- [ ] Event payloads contain IDs/status only — PHI stays in Medplum, UI fetches it with the user token (phi-review skill passes)
- [ ] Client abort stops server work subscription (no leaks — test)
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q1 | May AI text deltas (which contain PHI) stream over SSE? | T1 | Yes, to the authorised user only, over TLS, never persisted in Redis beyond the job; progress events stay PHI-free |
| Q2 | `fastify-sse-v2` vs official `@fastify/sse` (0.6.0) | T2 | Keep `fastify-sse-v2` (already installed); revisit when `@fastify/sse` ≥ 1.0 |
| Q3 | App Gateway buffering for SSE | T2 | Disable response buffering on `/jobs/*/events` path (P06 note) |
