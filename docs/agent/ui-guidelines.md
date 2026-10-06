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
| Icons / theme? | `@asc/ui/icons` (lucide re-export) · `ThemeProvider` / `ThemeToggle` from leaf paths (`@asc/ui/components/theme/*`) — never `lucide-react` / `next-themes` in an app |
| Importing `@asc/validation` or `@asc/config` in browser code? | Use the **leaf subpath** (`@asc/validation/auth`, `@asc/config/public-env`, `@asc/config/api`, `@asc/authz/can` · `/grants` · `/roles` · `/workspaces`). Their root entries use NodeNext `.js` re-exports that Turbopack can't resolve (lint-enforced) |
| Importing `@asc/ui`? | Root `@asc/ui` is permitted in client feature components on signed-in routes. Use leaf imports in `src/app/**`, the auth tree (`src/components/auth/**`), the landing tree (`src/features/landing/**`), and Server Components (route files and anything they import directly, without a use client file in between) (LM-011) |
| Show or hide something by permission? | `useCan()`, `<Can>` or `<RequireCapability>` (`apps/web/src/hooks/use-can.ts`, `components/auth/`) with a **capability** — never compare role names (lint: `asc/no-role-name-comparison`). Screens and nav list their capabilities in `lib/route-access.ts`. UI gating is convenience; apps/api and Medplum enforce |
| Fake API data during development? | MSW handlers in `apps/web/src/mocks` (on by default in dev, `NEXT_PUBLIC_API_MOCKING=disabled` to turn off; production builds only with `NEXT_PUBLIC_API_MOCKING=enabled` for the hosted demo — see [Deployment Configuration](../DEPLOYMENT_CONFIGURATION.md)). UI code never imports mock data — it calls `@asc/api-client` like production |

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

## 3a. Hooks, state and config-driven UI (clean components)

Components stay small and declarative. Hooks are for synchronising with something, not for storing every value. **Enforced by lint** (`asc/max-hooks-per-component`, per component or custom hook): `useState` ≤ 2 · `useEffect` ≤ 1 · `useLayoutEffect` ≤ 1 · `useRef` ≤ 2. Hitting a limit means restructure, not disable. See [`LEARNING_MISTAKES.md`](../../LEARNING_MISTAKES.md) LM-003.

| Instead of… | Do this |
|---|---|
| Several `useState` for related values (`email`, `password`, `errors`, `showX`…) | **One object state** `useState<FormState>()` or **`useReducer`**; for forms, **react-hook-form** owns field values and errors (`setError("root", …)` for server errors) |
| `useState` + `useEffect` to keep a derived value in sync | **Derive during render** (`const selected = items.find(...) ?? items[0]`); `useMemo` only if measured slow |
| `useEffect` to fetch data | TanStack Query / Medplum hooks (§3) |
| `useEffect` reacting to a user action | Run the logic in the **event handler** |
| `useState` + `useEffect` subscribing to browser/external state (media query, online status) | **`useSyncExternalStore`** (see `@asc/ui` `useIsMobile`) |
| `useRef` to hold data between renders | State, props or the query cache; refs are for DOM nodes / imperative handles |
| 10 hand-written field blocks, `if (role === …)` chains | A **config array/map** + `.map()` (below) |
| `if / else if` chains mapping a value to behaviour | A `Record<Key, Value>` lookup (e.g. `CASE_FILTERS[role]`) |
| One-off constants inline in JSX (`15000`, `"/auth/login"`) | Named constants in `@asc/config` or at module top |

**Config-driven forms.** Describe fields as data with `FieldConfig` from `@asc/ui`, render with `FormField`, validate with the shared Zod schema. When the set of fields depends on something (role, procedure), keep that mapping **once** in `@asc/validation` so the schema and the form read the same source.

```tsx
// apps/web — request access (abridged). RHF owns values + errors; the Zod schema in @asc/validation
// says which fields are required.
const FIELDS: readonly FieldConfig<keyof AccessRequestFormData>[] = [
  { name: "fullName", label: "Full name", autoComplete: "name" },
  { name: "email", label: "Work email", type: "email", autoComplete: "email" },
  { name: "facilityCode", label: "Facility ID (optional)", mono: true },
];

{FIELDS.map((field) => (
  <FormField key={field.name} id={`access-${field.name}`} label={field.label} error={errors[field.name]?.message}>
    <Input id={`access-${field.name}`} type={field.type ?? "text"} {...register(field.name)} />
  </FormField>
))}
```

Other rules of thumb:
- A component that grows past ~150 lines or mixes data loading with layout → split into a container (feature hook + composition) and presentational pieces.
- Extract a custom hook (`useXyz` in `features/<domain>/`) when logic is reused or a component needs more than its hook budget; the budget applies to the hook too.
- Prefer `const` lookups and pure helpers at module scope over functions re-created in render.
- No `alert()`/`confirm()`; use `@asc/ui` dialogs and toasts.

## 3b. Workflow Tabs & Dynamic Splitting

- **`@asc/ui` Import Policy:** Root `@asc/ui` is permitted in client feature components on signed-in routes. Use leaf imports in `src/app/**`, the auth tree (`src/components/auth/**`), the landing tree (`src/features/landing/**`), and Server Components (route files and anything they import directly, without a use client file in between).
- **The `lazyTab` + `preload` Pattern:** Heavy tab implementations are split via `dynamic()` with on-demand preloading as defined directly in `apps/web/src/features/case/case-tabs.ts`. Each tab returns `{ Component, preload }`, where `Component` is a lazy component and `preload` triggers chunk loading. In `apps/web/src/features/case/case-workspace.tsx`, `TabsTrigger` calls `preload` on `onPointerEnter` and `onFocus` so tab code begins downloading before the user clicks. `preload` swallows its own rejection (`load().catch(() => undefined)`): it is speculative, and real load errors are reported by the `dynamic` render path when the tab is opened.
- **SSR Strategy (`{ ssr: false }` vs Default SSR):**
  - **`{ ssr: false }`:** Use for client-only overlays/modals triggered strictly on demand (e.g. `CommandPalette`, `WelcomeDialog`). They are not visible on initial render, so omitting server HTML avoids server rendering costs and hydration overhead.
  - **Default SSR with `<LoadingSkeleton variant="detail" />`:** Use for workflow tabs inside Base UI panels. This ensures panels render consistent placeholder skeletons during SSR and initial paint, eliminating layout shifts and hydration mismatches.
- **Testing Boundary for `/cases/[caseId]`:**
  - Prerendered routes have KB budgets in `perf-budget.json`.
  - Dynamic per-request routes like `/cases/[caseId]` are dynamic server routes without static HTML files, so their starting entry bundle is inspected via `.next/server/app/(dashboard)/cases/[caseId]/page_client-reference-manifest.js`.
  - In `apps/web/perf/bundles.test.ts`, the test extracts `entryJSFiles["[project]/apps/web/src/app/(dashboard)/cases/[caseId]/page"]` to verify:
    1. Starting entry chunks do NOT contain `"Retroflexion in rectum"` (proving that case tabs are code-split and not bundled into the starting entry).
    2. Starting entry chunks stay within `dynamicBudgetsKbGz["/cases/[caseId]"]` in `apps/web/perf/perf-budget.json`.

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
import { noteJobEvents } from "@asc/validation/sse"; // browser code imports leaf subpaths (§1)
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
- **No auth tokens or user profiles in browser storage.** The session lives in memory (`useAuthStore`); signed-in areas are wrapped in `RequireAuth` until Medplum sign-in (P05) replaces the mock. Only non-sensitive UI preferences (e.g. `theme`) may use `localStorage` (LM-004).
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
- [ ] Hook budget respected (§3a): related state grouped, derived values computed in render, forms/lists rendered from config with `.map()`
- [ ] Browser code imports leaf subpaths of `@asc/validation` / `@asc/config`; page actually loads in `pnpm dev` (not only typecheck)
- [ ] New component listed in `packages/ui/CATALOG.md`
- [ ] All five async states handled; error boundary + Suspense per segment
- [ ] Realtime via the correct channel (§5); no `EventSource`, no polling
- [ ] AI values marked draft with provenance; no auto-final action
- [ ] No PHI in URL/logs/storage; `data-testid`s present
- [ ] `pnpm turbo run lint check-types test --filter=web --filter=@asc/ui` green
- [ ] Root `@asc/ui` imports only in client feature components on signed-in routes; leaf imports in `src/app/**`, auth (`src/components/auth/**`), landing (`src/features/landing/**`), and non-client files (LM-011)
- [ ] Workflow tabs and heavy interactive overlays are dynamically imported (`next/dynamic`) with loading fallbacks
- [ ] `pnpm --filter web test:bundles` passes bundle budget and forbidden string checks
- [ ] `PROGRESS.md` updated; any correction recorded in `LEARNING_MISTAKES.md`
