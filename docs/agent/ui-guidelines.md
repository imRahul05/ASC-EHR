# UI Guidelines — agent-friendly, clinical-grade, realtime

**Consult when:** building or changing anything under `apps/web` or `packages/ui`, adding a data hook, or streaming anything to the browser.
Read with: [architecture rules](architecture.md) · [implementation plan](../plan/implementation-plan.md) · [COMPLIANCE_AND_PHI](../COMPLIANCE_AND_PHI.md) · [`LEARNING_MISTAKES.md`](../../LEARNING_MISTAKES.md).

Stack (from `package.json`s): Next.js 16 App Router · React 19 · Tailwind v4 · shadcn on **Base UI** (never Radix) in `@asc/ui` · TanStack Query 5 · react-hook-form + Zod (`@asc/validation`) · zustand (local UI state only) · Medplum `@medplum/react-hooks` (headless) · SSE via `@asc/api-client`.

---

## 1. The four UI layers — where every line goes

```text
apps/web/src/app/**/page.tsx          ROUTE      thin: params → feature component. No logic, no fetching code.
apps/web/src/features/<domain>/       FEATURE    compose @asc/ui + data hooks; route-level state (nuqs); no types/schemas
@asc/api-client (/react)              DATA       fetch/SSE clients, Medplum client factories, TanStack Query hooks
@asc/ui                               KIT        presentational components; props in, callbacks out; NO fetching, NO Medplum, NO routing
```

| Question | Answer |
|---|---|
| Needs data from the server? | Hook in `@asc/api-client/react` (commands) or `@medplum/react-hooks` in the feature (reads) |
| Reusable on a second screen? | `@asc/ui` (+ add to `packages/ui/CATALOG.md`) |
| Type or Zod schema? | `@asc/types` / `@asc/validation` — never in `apps/web` |
| Clinical rule (gate, score, conflict)? | `@asc/clinical-rules` — UI calls it for instant feedback; API re-checks |
| Third-party UI lib? | Install in `@asc/ui` only, never `apps/web` |

**Before creating a component:** search `packages/ui/CATALOG.md` and `packages/ui/src/index.ts`. Extending an existing component beats a near-duplicate.

## 2. Conventions agents can follow mechanically

- Files kebab-case, one exported component per file, named export (`export function PatientBanner`).
- Props interface in the same file, suffixed `Props`, all fields `readonly`. Domain types imported from `@asc/types`/`@asc/fhir`.
- `"use client"` only on the leaf that needs it; pages and layouts stay Server Components where possible.
- Styling: Tailwind classes + `cn()`; colours only from tokens (`--phase-*`, `--severity-*`, `--draft`) — no hex in components.
- Every interactive element: accessible name, visible focus, `data-testid="<domain>-<element>"` (e.g. `case-transition-button`).
- Icons from `lucide-react`; toasts via `sonner` from `@asc/ui`.
- Component template:

```tsx
// packages/ui/src/components/clinical/status-chip.tsx
import type { CasePhase } from "@asc/fhir";
import { cn } from "../../lib/utils";

export interface StatusChipProps {
  readonly phase: CasePhase;
  readonly size?: "sm" | "lg";
  readonly className?: string;
}

export function StatusChip({ phase, size = "sm", className }: StatusChipProps) {
  return (
    <span
      data-testid="case-status-chip"
      className={cn("inline-flex items-center rounded-md font-medium", `bg-phase-${phase}`, size === "lg" && "text-lg px-3 py-1", className)}
    >
      {PHASE_LABEL[phase]}
    </span>
  );
}
```

## 3. Data access

| Kind | Use | Never |
|---|---|---|
| Read / search FHIR | `useSearchResources`, `useResource` from `@medplum/react-hooks` (user token; AccessPolicy + AuditEvent apply) | proxying reads through `apps/api` |
| Command with rules (book, transition, sign) | TanStack `useMutation` hook from `@asc/api-client/react` → `apps/api` | writing multi-resource FHIR from the browser |
| Live FHIR changes (whiteboard, worklists) | `useSubscription` (Medplum WebSocket) → invalidate/patch query | polling |
| AI stream / job progress | `useEventStream` (§5) | `EventSource` (cannot send bearer token) |
| Forms | react-hook-form + `zodResolver(schemaFrom@asc/validation)`; clinical forms = Questionnaire renderer (P11) | ad-hoc `useState` forms, schemas in the app |
| Local UI state | component state, zustand for cross-component UI-only state | PHI in zustand persisted storage |
| URL state (tabs, filters) | `nuqs` | PHI in URLs — IDs only |

- No `useEffect` for fetching. Server state lives in the Query/Medplum cache.
- Mutations are **optimistic** only when the server rule cannot reject in normal use (e.g. toggling a row); gated transitions show pending state and wait.
- React 19: `useOptimistic` for optimistic rows, `useActionState` for simple server actions, `use()` + Suspense for promise data in Server Components.

## 4. Required async states (every data view)

Use `@asc/ui` `AsyncState` set; each view handles all five:

| State | Component | Rule |
|---|---|---|
| Loading | `<Loading/>` skeleton of the final layout | no spinners over > 300 ms blank areas |
| Empty | `<Empty action/>` | tell the user the next action |
| Error | `<ErrorState retry/>` | message from `ApiError.code`, never raw server text/PHI |
| Stale | `<Stale/>` badge | when realtime channel disconnected |
| Offline | `<Offline/>` banner | queued-entry count visible (AIMS, room tablet) |

Wrap each route segment in an error boundary (`error.tsx`) and a Suspense boundary (`loading.tsx`).

## 5. Realtime: SSE, WebSockets and streaming

Three channels, each for one job:

| Channel | Transport | Carries | Hook |
|---|---|---|---|
| **AI stream** | SSE from `apps/api` | token/section deltas of a draft the user is waiting on | `useEventStream` |
| **Job progress** | SSE from `apps/api` (fed by worker via Redis stream) | step status, `draft_ready`, `completed`, `failed` — **IDs and status only** | `useEventStream` |
| **Data change** | Medplum WebSocket Subscriptions | "resource X changed" | `useSubscription` |

### 5.1 Event contract (`@asc/validation/sse`)

```ts
// envelope — every SSE message
{ id: string;          // monotonically increasing per stream → Last-Event-ID resume
  type: SseEventType;  // "job.step" | "job.progress" | "ai.delta" | "ai.section" | "ai.draft_ready" | "job.completed" | "job.failed" | "heartbeat"
  ts: string;          // ISO time
  data: unknown }      // validated per type by the registry
```

Rules:
1. Server sends `heartbeat` every 15 s (`@asc/config` realtime constants) so proxies don't cut the stream.
2. Client sends `Last-Event-ID` on reconnect; server replays from Redis stream.
3. Every event is Zod-validated on the client; unknown types are ignored, not crashed on.
4. Progress events never contain PHI; the UI refetches the resource by ID with the user token. `ai.delta` may contain PHI — only to the authorised requester, never persisted beyond the job TTL, never logged.
5. Client abort (unmount, navigation) closes the fetch; server stops listening.
6. Terminal events (`job.completed`/`job.failed`) close the stream.

### 5.2 Client usage

```tsx
// apps/web/src/features/note/note-progress.tsx
"use client";
import { useEventStream } from "@asc/api-client/react";
import { noteJobEvents } from "@asc/validation";
import { DraftBanner, StreamingText, AsyncState } from "@asc/ui";

export function NoteProgress({ jobId }: { readonly jobId: string }) {
  const { status, lastEvent, events } = useEventStream(`/jobs/${jobId}/events`, noteJobEvents);
  if (status === "error") return <AsyncState.ErrorState retry />;
  const text = events.filter((e) => e.type === "ai.delta").map((e) => e.data.text).join("");
  return (
    <>
      <DraftBanner state={lastEvent?.type === "ai.draft_ready" ? "draft" : "streaming"} />
      <StreamingText text={text} />
    </>
  );
}
```

`useEventStream` is built on `fetch` + `eventsource-parser` (bearer header, resume, backoff) — see [P10](../plan/phases/P10-realtime-sse.md).

### 5.3 Server usage (sketch)

```ts
// apps/api/src/routes/events.ts — uses the sse plugin from P10
app.get("/jobs/:jobId/events", { preHandler: [app.requireUser] }, async (req, reply) => {
  await assertJobOwner(req.user, req.params.jobId);           // services/, never trust the id alone
  return reply.sseStream(jobEvents(req.params.jobId, req.headers["last-event-id"]), sseEnvelope);
});
```

### 5.4 Which path for AI?

| Work | Path |
|---|---|
| < ~10 s, user waiting, single call (e.g. H&P section redraft) | API streams the agent directly (interactive queue optional) |
| Multi-step or > 10 s (procedure note, coding) | enqueue worker job → return `jobId` → UI subscribes to job events; draft appears on `ai.draft_ready` (MindScript draft-first) |

## 6. AI UX rules (the wedge)

State of any AI-produced value: `streaming → draft → accepted | edited | rejected → signed`.

- **Visible draft.** `DraftBanner` + per-field AI marker until a clinician accepts or edits. Colour + icon + text (not colour alone).
- **Provenance on hover/tap.** `ProvenanceChip`: agent name, prompt version, time; human edits show the editor.
- **Never auto-sign, auto-code-final, or auto-send.** The sign/attest/send button belongs to a human and is disabled while any blocking gap-chip exists.
- **Exceptions first.** Review screens sort by low confidence / failed verification / gap-chips; everything else collapsed.
- **Cancel and retry** are always visible during generation; show elapsed time.
- **Explain why.** Rule failures show the rule's reason text from `RuleResult`; coding suggestions show evidence links (resource IDs → click to highlight).
- **Clinician edits win.** Background AI branches (critic) never overwrite a field the user touched — show a suggestion instead.

## 7. Clinical UX rules

- **Patient banner** on every patient/case screen (name, age, sex, allergies, case phase). Wrong-patient guard: switching patients clears unsaved state after confirm.
- **Touch:** targets ≥ 44 px; `variant="room"` ≥ 48 px, large type, high contrast for gloved use and distance viewing.
- **Keyboard-first** on desk screens: shortcuts registered in the hotkeys registry and listed in a `?` help dialog; command palette via Base UI Combobox (not `cmdk`).
- **Irreversible actions** (sign, discharge, submit export, break-glass) need an explicit confirm naming the patient + action.
- **Time:** always facility timezone (`@asc/clinical-rules/time`), 24 h clock in clinical areas, relative time only as a secondary hint.
- **Units** always shown with values (mg, mL, mmHg, cm).
- **Density:** worklists/flowsheets use `@tanstack/react-virtual` above ~100 rows.
- **Motion:** respect `prefers-reduced-motion`; no animation on clinical data changes beyond a brief highlight.

## 8. Accessibility (WCAG 2.2 AA)

Base UI primitives give keyboard + ARIA; keep them. Label every input; `aria-live="polite"` for streaming text and toasts, `assertive` only for blocking alerts; contrast ≥ 4.5:1; component tests run axe.

## 9. PHI in the browser

- No PHI in URLs, page titles, analytics, console, error messages, or `localStorage`/`sessionStorage`.
- Offline queue (AIMS/room tablet) is the only local PHI store: encrypted, purged on sync and logout ([P20](../plan/phases/P20-aims-flowsheet.md)).
- Logout clears Query cache, Medplum client, zustand stores, offline keys.
- Whiteboard in public-facing areas: initials + case number only.

## 10. Testing

| Layer | Tool | Must cover |
|---|---|---|
| `@asc/ui` | Vitest + Testing Library + axe | props render, keyboard, a11y, all async states |
| data hooks | Vitest + `MockClient` (`@medplum/mock`) + msw | success, error, reconnect/resume for streams |
| features/pages | Playwright (`apps/web/e2e`) | the phase's acceptance flow on synthetic data |

## 11. Agent pre-PR checklist (UI)

- [ ] No types, Zod schemas, fetch clients or UI libraries added under `apps/web`
- [ ] New component listed in `packages/ui/CATALOG.md`
- [ ] All five async states handled; error boundary + Suspense per segment
- [ ] Realtime via the correct channel (§5); no `EventSource`, no polling
- [ ] AI values marked draft with provenance; no auto-final action
- [ ] No PHI in URL/logs/storage; `data-testid`s present
- [ ] `pnpm turbo run lint check-types test --filter=web --filter=@asc/ui` green
- [ ] `PROGRESS.md` updated; any correction recorded in `LEARNING_MISTAKES.md`
