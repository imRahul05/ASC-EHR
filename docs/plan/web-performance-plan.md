# Web performance fixes (apps/web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the measured causes of excess JavaScript and render-blocking CSS in `apps/web`, prove each removal with a bundle test and Lighthouse, and leave guards so they cannot come back.

**Architecture:** One attributable change per task (and per PR): cut the one import edge that ships the case workspace to every signed-in route; stop the landing page shipping the whole `@asc/ui` kit; start MSW only in the route groups that call the API; then decide on inlining CSS by measurement. A Vitest bundle test reads the production build (`.next`) and fails when forbidden code ships on a route or a route exceeds its JS budget.

**Tech Stack:** Next.js 16.3.6 (App Router, Turbopack), React 19.2.8, pnpm 10 workspaces, Vitest 5, Lighthouse 13.5.0 CLI.

**Spec:** the audit report (https://claude.ai/artifact/MkpJsWSUrvTh4u5zTQXMtr) plus the Lighthouse and bundle measurements in §1 of this file, taken 2026-10-01 on `main` @ `45a937a`.

## Global Constraints

- Measure production builds only (`next build && next start`), never `next dev`. Dev-mode Lighthouse numbers (unminified JS, dev runtime, MSW on by default) are not comparable.
- Build env for every measurement: `NEXT_PUBLIC_API_URL=https://api.example.com` (fake placeholder, required by the LM-010 build guard) and `NEXT_PUBLIC_API_MOCKING=enabled` (the hosted demo configuration).
- Lighthouse: `lighthouse@13.5.0`, headless, performance category only, 5 runs per route and device, report the median.
- Browser code imports `@asc/ui` leaf subpaths where it matters for bundles (LM-005); apps never export types (LM-001); at most 1 `useEffect` and 2 `useState` per component (LM-003); only `@asc/config` reads `process.env` (LM-006).
- Every UI change is checked in the running app, not only by typecheck (LM-005).
- One major variable per PR, so each before/after delta is attributable.
- `pnpm --filter web lint` and `pnpm --filter web check-types` stay green on every commit.

## Review Focus

1. **A forbidden-string rule whose string disappears** (UI copy edited) must fail loudly, not pass vacuously. Task 1's "still exists in some chunk" test covers it.
2. **A shell or guide module importing `case-tabs.ts` again** (e.g. to read tab labels) re-ships every tab. Task 2's forbidden rule fails the bundle test.
3. **The first client navigation from `/` to `/login` in demo mode** now waits for the MSW worker to start (it used to start on landing). The landing page must stay visible and the login page must render with personas. Task 4, step 6 checks this in the browser.
4. **A hard reload of a deep dashboard URL in demo mode** (e.g. `/schedule`) must still get mocked data. MockProvider moves into the `(dashboard)` layout, above `RequireAuth`. Task 4, step 6.
5. **`sideEffects` dropping a module that registers something at import time.** No such module exists in `packages/ui/src` today (CSS is imported only through `globals.css`), but check the theme toggle, toaster and tooltips in the browser. Task 3, step 6.

---

## 1. Evidence: what each source found

### Lighthouse in your browser vs production lab runs

Your run was against `localhost:3000`, which in this repo is `next dev`. The production numbers differ a lot:

| Lighthouse item | Your run (`next dev`) | Production build (median of 5) | Verdict |
|---|---|---|---|
| Reduce unused JavaScript | ~560 KiB / ~390 ms | `/` 166 KiB, `/login` 161 KiB (demo mode); 121 / 118 KiB without MSW | Real, about 3× smaller than the dev number |
| Render-blocking resources | ~80 ms | Mobile ~450 ms, desktop ~100 ms (3 stylesheets: 22.6 KB + 1.7 KB + 1.3 KB) | Real, and larger on mobile |
| LCP | 1.7 s | `/` mobile 3.68 s, desktop 0.75 s; `/login` mobile 3.46 s, desktop 0.73 s | Simulated slow-4G figure; unthrottled observed LCP is 54–79 ms. Driven by the CSS and JS on the critical path, not by server time (TTFB 9 ms) |
| JS execution / parsing | "significant" | TBT 8–19 ms mobile, 0 desktop | JS cost is in download bytes, not main-thread time |
| Re-test in production | — | Done | — |

Other lab facts:
- The LCP element on `/` is the small nav brand text ("ASC EHR GI"), not the hero headline. The `<h1>` uses the `.rise` animation, which starts at `opacity: 0` with blur for 0.9 s, so it is not an LCP candidate at first paint. See open question Q1.
- `/login` mobile CLS was 0.285 when the persona API failed (5 skeleton cards collapse into one error line, inside a vertically centred column). With MSW answering it is 0.009. See open question Q2.
- In demo mode the landing page downloads both MSW chunks (8 KB + 122 KB transferred) although it never calls the API.

### Skill audit vs Lighthouse

| Problem | Skill audit (build + source) | Lighthouse | Task |
|---|---|---|---|
| Case workspace shipped on 16 of 21 routes (import edge `page-help-sheet.tsx` → `case-tabs.ts`) | Found, with the exact edge | Only as "unused JS" | Task 2 |
| Whole `@asc/ui` kit on the landing page | Found | Only as "unused JS" | Task 3 |
| MSW downloaded and awaited on every route in demo mode | Found | Shows as +45 KiB unused JS on `/` | Task 4 |
| Render-blocking CSS | Missed (rated 22 KB CSS "fine") | Found: ~450 ms mobile estimate | Task 5 |
| Headline invisible at first paint (`opacity: 0` entrance) | Missed | Visible through the LCP element choice | Q1 |
| Login layout shift on API error | Missed | Found (CLS 0.285) | Q2 |
| Landing player re-rendering offscreen | Found earlier | — | Already fixed on `main` (player pauses offscreen, when hidden, and under reduced motion) |

The skill explains *which import* causes the bytes. Lighthouse shows *timing* effects the static audit can't see. Both are needed.

### Bundle baseline (production, demo mode, gzipped initial JS)

| Route | Initial JS gz |
|---|---|
| `/dashboard` and the other 13 signed-in static routes | 427–435 KB |
| `/login` | 377 KB |
| `/` | 350 KB |
| `/_not-found` | 324 KB |

Median route-only share: 0.6%. Route splitting separates almost nothing.

### Pre-validated results (trial run in a scratch worktree, then reverted)

| Change | Measured effect |
|---|---|
| `sideEffects` on `@asc/ui` alone | No improvement (`/` 350 → 356 KB gz) |
| `experimental.optimizePackageImports: ["@asc/ui"]` alone | No change at all |
| Leaf imports in landing server components alone | No improvement (`/` 349.9 KB) |
| Leaf imports + `sideEffects` (Task 3) | `/` 350 → 294 KB gz; `SignaturePad` gone from `/` |
| Plus the case-tab split (Task 2) | `/dashboard` 432 → 349 KB, `/admin` 428 → 350 KB, `/_not-found` 324 → 242 KB; bundle test 6/6 green |

Treat these as expectations. Each task re-measures on its own branch.

---

## 2. Measurement protocol (used by every task)

```bash
# from apps/web
NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_API_URL=https://api.example.com NEXT_PUBLIC_API_MOCKING=enabled pnpm build
pnpm test:bundles                      # after Task 1 exists
pnpm start --port 3101 &               # production server; stop it with: kill %1
```

Lighthouse, 5 runs each for `/` and `/login`, mobile (default) and desktop:

```bash
mkdir -p /tmp/lh
for path in "" login; do for preset in mobile desktop; do for i in 1 2 3 4 5; do
  extra=""; [ "$preset" = desktop ] && extra="--preset=desktop"
  npx -y lighthouse@13.5.0 "http://localhost:3101/$path" --quiet --chrome-flags="--headless=new" \
    --only-categories=performance $extra --output=json --output-path="/tmp/lh/${path:-home}-$preset-$i.json"
done; done; done

# median per set: FCP, LCP, TBT, CLS, unused JS KiB, render-blocking FCP savings
for set in home-mobile home-desktop login-mobile login-desktop; do
  for metric in '.audits["first-contentful-paint"].numericValue' '.audits["largest-contentful-paint"].numericValue' \
                '.audits["total-blocking-time"].numericValue' '.audits["cumulative-layout-shift"].numericValue' \
                '(.audits["unused-javascript"].details.overallSavingsBytes // 0)/1024' \
                '.audits["render-blocking-insight"].metricSavings.FCP // 0'; do
    printf "%s " "$(for f in /tmp/lh/$set-*.json; do jq -r "$metric" "$f"; done | sort -n | sed -n 3p)"
  done; echo " <- $set (FCP LCP TBT CLS unusedKiB rblockMs)"
done
```

Baseline medians to compare against (`main` @ `45a937a`, demo mode):

| Set | FCP | LCP | TBT | CLS | Unused JS | Render-blocking |
|---|---|---|---|---|---|---|
| home-mobile | 1205 ms | 3682 ms | 18 ms | 0.000 | 166 KiB | 450 ms |
| home-desktop | 325 ms | 752 ms | 0 | 0.000 | 166 KiB | 100 ms |
| login-mobile | 1055 ms | 3462 ms | 8 ms | 0.009 | 161 KiB | 450 ms |
| login-desktop | 285 ms | 734 ms | 0 | 0.002 | 161 KiB | 100 ms |

Run-to-run spread on the same build was under 10 ms for FCP. LCP varied by up to about 770 ms on `/` mobile (one 2.9 s outlier), so compare medians.

---

## 3. File map

```text
apps/web/perf/bundles.test.ts                 NEW   Vitest bundle guard over .next (Task 1)
apps/web/perf/perf-budget.json                NEW   forbidden strings + per-route JS budgets (Tasks 1–3, 6)
apps/web/package.json                         EDIT  "test:bundles" script (Task 1)
apps/web/src/features/case/case-tab-ids.ts    NEW   tab ids, DEFAULT_TAB_BY_PHASE, isCaseTab; no component imports (Task 2)
apps/web/src/features/case/case-tabs.ts       EDIT  keeps CASE_TABS (components) only (Task 2)
apps/web/src/features/case/use-case-tab.ts    EDIT  import from case-tab-ids (Task 2)
apps/web/src/features/guide/page-help-sheet.tsx EDIT import from case-tab-ids (Task 2)
packages/ui/package.json                      EDIT  "sideEffects": ["**/*.css"] (Task 3)
apps/web/src/features/landing/{landing-nav,landing-hero,workflow-section,section-heading,cta-section}.tsx  EDIT leaf imports (Task 3)
apps/web/src/app/(marketing)/loading.tsx      EDIT  leaf import (Task 3)
apps/web/src/app/providers.tsx                EDIT  drop MockProvider (Task 4)
apps/web/src/app/(auth)/layout.tsx            EDIT  wrap page area in MockProvider (Task 4)
apps/web/src/app/(dashboard)/layout.tsx       EDIT  wrap shell in MockProvider (Task 4)
apps/web/next.config.ts                       EDIT  experimental.inlineCss, kept only if measured better (Task 5)
PROGRESS.md                                   EDIT  done log + next up (Task 6)
```

---

### Task 1: Bundle guard test

**Files:**
- Create: `apps/web/perf/bundles.test.ts`
- Create: `apps/web/perf/perf-budget.json`
- Modify: `apps/web/package.json` (scripts)

**Interfaces:**
- Produces: `pnpm --filter web test:bundles` and the `perf-budget.json` shape `{ budgetsKbGz: Record<route, number>, forbidden: { string, notIn: "*" | string[], reason }[] }`. Tasks 2, 3 and 6 add entries to this file.

- [ ] **Step 1: Create the budget file with no rules yet**

`apps/web/perf/perf-budget.json`:
```json
{
  "budgetsKbGz": {},
  "forbidden": []
}
```

- [ ] **Step 2: Write the test**

`apps/web/perf/bundles.test.ts`:
```ts
// Bundle guard for apps/web. Reads the production build in .next, so run `next build` first:
//   pnpm --filter web build && pnpm --filter web test:bundles
// Rules live in perf/perf-budget.json. Each forbidden string must still exist in some chunk;
// otherwise the copy changed and the rule would pass while guarding nothing.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

interface ForbiddenRule {
  readonly string: string;
  /** "*" = every prerendered route, or a list of routes. */
  readonly notIn: "*" | readonly string[];
  readonly reason: string;
}

interface PerfBudget {
  /** Max gzipped initial JS per prerendered route in KB; "*" applies to unlisted routes. */
  readonly budgetsKbGz: Readonly<Record<string, number>>;
  readonly forbidden: readonly ForbiddenRule[];
}

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const DOT_NEXT = path.join(APP_DIR, ".next");
const HTML_DIR = path.join(DOT_NEXT, "server/app");
const CHUNK_RE = /static\/chunks\/[^"'\\\s]+?\.js/g;

const budget = JSON.parse(readFileSync(path.join(APP_DIR, "perf/perf-budget.json"), "utf8")) as PerfBudget;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
  );
}

/** Prerendered routes and the JS chunks their HTML loads up front. Route groups like (dashboard) are dropped. */
function loadRoutes(): { route: string; chunks: string[] }[] {
  return walk(HTML_DIR)
    .filter((file) => file.endsWith(".html") && !path.basename(file).startsWith("_"))
    .map((file) => {
      const rel = path.relative(HTML_DIR, file).replace(/\.html$/, "").split(path.sep).join("/");
      const route = rel === "index" ? "/" : "/" + rel.split("/").filter((s) => !/^\(.+\)$/.test(s)).join("/");
      return { route, chunks: [...new Set(readFileSync(file, "utf8").match(CHUNK_RE) ?? [])] };
    });
}

const hasBuild = existsSync(HTML_DIR);
const routes = hasBuild ? loadRoutes() : [];
const chunkSource = (rel: string) => readFileSync(path.join(DOT_NEXT, rel));
const gzKb = (chunks: readonly string[]) =>
  chunks.reduce((sum, rel) => sum + gzipSync(chunkSource(rel), { level: 9 }).length, 0) / 1024;

describe("apps/web production bundles", () => {
  it("has a production build to check", () => {
    expect(hasBuild, "No .next/server/app: run `pnpm --filter web build` first").toBe(true);
    expect(routes.length).toBeGreaterThan(0);
  });

  const allChunks = hasBuild
    ? walk(path.join(DOT_NEXT, "static/chunks"))
        .filter((file) => file.endsWith(".js"))
        .map((file) => path.relative(DOT_NEXT, file).split(path.sep).join("/"))
    : [];

  describe.each(budget.forbidden)('"$string"', (rule) => {
    const holders = new Set(allChunks.filter((chunk) => chunkSource(chunk).includes(rule.string)));

    it("still exists in some chunk (rule is not stale)", () => {
      expect(holders.size, `"${rule.string}" is in no chunk: point this rule at a string that still exists`).toBeGreaterThan(0);
    });

    it(`is not loaded up front where forbidden (${rule.reason})`, () => {
      const targets = rule.notIn === "*" ? routes : routes.filter((r) => rule.notIn.includes(r.route));
      const offending = targets.filter((r) => r.chunks.some((chunk) => holders.has(chunk))).map((r) => r.route);
      expect(offending).toEqual([]);
    });
  });

  it("keeps every prerendered route within its initial JS budget", () => {
    const over = routes.flatMap(({ route, chunks }) => {
      const limit = budget.budgetsKbGz[route] ?? budget.budgetsKbGz["*"];
      const kb = gzKb(chunks);
      return limit !== undefined && kb > limit ? [`${route}: ${kb.toFixed(1)} KB gz > ${limit} KB`] : [];
    });
    expect(over).toEqual([]);
  });
});
```

- [ ] **Step 3: Add the script**

In `apps/web/package.json` `scripts`, after `"check-types"`:
```json
    "test:bundles": "vitest run perf/"
```
It is deliberately not named `test`, so `turbo run test` does not run it before a build exists.

- [ ] **Step 4: Run it against a fresh build**

Run the build from §2, then `pnpm --filter web test:bundles`.
Expected: PASS (2 tests: build present, budgets, with nothing forbidden yet).

- [ ] **Step 5: Check the stale-rule test fails as designed**

Temporarily set `"forbidden": [{ "string": "zz-not-in-any-chunk", "notIn": "*", "reason": "probe" }]` and run it.
Expected: FAIL with `"zz-not-in-any-chunk" is in no chunk`. Revert the file to Step 1's content.

- [ ] **Step 6: Lint, typecheck, commit**

```bash
pnpm --filter web lint && pnpm --filter web check-types
git add apps/web/perf apps/web/package.json
git commit -m "test(web): bundle guard over the production build"
```

---

### Task 2: Stop shipping the case workspace on every signed-in route

**Files:**
- Create: `apps/web/src/features/case/case-tab-ids.ts`
- Modify: `apps/web/src/features/case/case-tabs.ts` (whole file)
- Modify: `apps/web/src/features/case/use-case-tab.ts:5`
- Modify: `apps/web/src/features/guide/page-help-sheet.tsx:11`
- Modify: `apps/web/perf/perf-budget.json`

**Interfaces:**
- Consumes: `test:bundles` (Task 1).
- Produces: `CASE_TAB_IDS`, `DEFAULT_TAB_BY_PHASE`, `isCaseTab(value: string | null): value is CaseTabId` from `case-tab-ids.ts`. `CASE_TABS` stays in `case-tabs.ts` with the same shape.

- [ ] **Step 1: Write the failing rule**

`apps/web/perf/perf-budget.json`, `forbidden`:
```json
    { "string": "Retroflexion in rectum", "notIn": "*", "reason": "case workspace tabs belong to /cases/[caseId] only" }
```
("Retroflexion in rectum" is UI copy in the procedure tab. Every prerendered route is checked; `/cases/[caseId]` is dynamic and has no HTML, so it is not.)

- [ ] **Step 2: Run it to verify it fails**

Build (§2), then `pnpm --filter web test:bundles`.
Expected: FAIL, offending routes `/admin /audit /coding /dashboard /guide /my-care /pathology /patients /patients/new /quality /referrals /schedule /whiteboard /worklist`.

- [ ] **Step 3: Create the component-free ids module**

`apps/web/src/features/case/case-tab-ids.ts`:
```ts
import type { CasePhase } from "@asc/types";

/**
 * Case tab ids in workflow order, with no component imports, so shell code (help sheet, guide)
 * can read them without pulling every case tab into its routes. Components live in `case-tabs.ts`.
 */
export const CASE_TAB_IDS = [
  "pre-procedure",
  "pre-op",
  "procedure",
  "anesthesia",
  "note",
  "recovery",
  "coding",
  "pathology",
] as const;

type CaseTabId = (typeof CASE_TAB_IDS)[number];

/** Tab opened when the URL has no `?tab=` — follows where the case is in the workflow. */
export const DEFAULT_TAB_BY_PHASE: Readonly<Record<CasePhase, CaseTabId>> = {
  SCHEDULED: "pre-procedure",
  CONFIRMED: "pre-procedure",
  ARRIVED: "pre-op",
  PRE_OP: "pre-op",
  READY_FOR_PROCEDURE: "procedure",
  IN_PROCEDURE: "procedure",
  RECOVERY: "recovery",
  READY_FOR_DISCHARGE: "recovery",
  DISCHARGED: "note",
  CHART_COMPLETE: "coding",
  CODED: "coding",
  EXPORTED: "pathology",
  CLOSED: "pathology",
  CANCELLED: "pre-procedure",
  NO_SHOW: "pre-procedure",
};

export function isCaseTab(value: string | null): value is CaseTabId {
  return CASE_TAB_IDS.some((id) => id === value);
}
```
`CaseTabId` is not exported: apps may not export types (LM-001, enforced by lint).

- [ ] **Step 4: Reduce `case-tabs.ts` to the component registry**

Replace `apps/web/src/features/case/case-tabs.ts` with:
```ts
import {
  Activity,
  ClipboardCheck,
  FileText,
  HeartPulse,
  Microscope,
  Receipt,
  Stethoscope,
  Syringe,
  type LucideIcon,
} from "@asc/ui/icons";
import type { CASE_TAB_IDS } from "./case-tab-ids";
import { AnesthesiaTab } from "./tabs/anesthesia-tab";
import { CodingTab } from "./tabs/coding-tab";
import { NoteTab } from "./tabs/note-tab";
import { PathologyTab } from "./tabs/pathology-tab";
import { PreOpTab } from "./tabs/pre-op-tab";
import { PreProcedureTab } from "./tabs/pre-procedure-tab";
import { ProcedureTab } from "./tabs/procedure-tab";
import { RecoveryTab } from "./tabs/recovery-tab";

/**
 * Case workspace tabs, in workflow order. Each tab is `features/case/tabs/<id>-tab.tsx`
 * with props `{ caseId }`; the owning feature agent fills it in (spec §4).
 * Ids, defaults and `isCaseTab` live in `case-tab-ids.ts`: import those from there, not from here,
 * outside the case workspace (this module pulls in every tab component).
 */
export const CASE_TABS = [
  { id: "pre-procedure", label: "Pre-procedure", icon: Stethoscope, Component: PreProcedureTab },
  { id: "pre-op", label: "Pre-op", icon: ClipboardCheck, Component: PreOpTab },
  { id: "procedure", label: "Procedure", icon: Activity, Component: ProcedureTab },
  { id: "anesthesia", label: "Anesthesia", icon: Syringe, Component: AnesthesiaTab },
  { id: "note", label: "Note", icon: FileText, Component: NoteTab },
  { id: "recovery", label: "Recovery", icon: HeartPulse, Component: RecoveryTab },
  { id: "coding", label: "Coding", icon: Receipt, Component: CodingTab },
  { id: "pathology", label: "Pathology", icon: Microscope, Component: PathologyTab },
] as const satisfies readonly {
  id: (typeof CASE_TAB_IDS)[number];
  label: string;
  icon: LucideIcon;
  Component: (props: { readonly caseId: string }) => React.ReactNode;
}[];
```

- [ ] **Step 5: Point both importers at the ids module**

`apps/web/src/features/case/use-case-tab.ts` line 5:
```ts
import { DEFAULT_TAB_BY_PHASE, isCaseTab } from "./case-tab-ids";
```
`apps/web/src/features/guide/page-help-sheet.tsx` line 11:
```ts
import { DEFAULT_TAB_BY_PHASE, isCaseTab } from "@/features/case/case-tab-ids";
```
Confirm nothing else uses the moved names: `grep -rn "case-tabs\"" apps/web/src` should list only `case-workspace.tsx`.

- [ ] **Step 6: Run the test to verify it passes**

Build (§2), then `pnpm --filter web test:bundles`.
Expected: PASS. Record the new initial JS per route for the PR description. Either run `node ~/.claude/skills/frontend-performance-engineer/scripts/next-route-bundles.mjs apps/web` (if the skill is installed), or temporarily set `"budgetsKbGz": { "*": 1 }`, run the test, read every route's size from the failure list, and revert. Trial expectation: `/dashboard` about 432 → 349 KB gz.

- [ ] **Step 7: Check in the browser (LM-005)**

`pnpm --filter web dev`, demo-login as Surgeon:
- open a case from the worklist: the default tab matches its phase, and `?tab=note` switches tabs;
- open Help (?) on a case page: the help sheet shows the current tab's help;
- `?tab=nonsense` falls back to the phase default.

- [ ] **Step 8: Lint, typecheck, commit**

```bash
pnpm --filter web lint && pnpm --filter web check-types
git add apps/web/src/features/case apps/web/src/features/guide/page-help-sheet.tsx apps/web/perf/perf-budget.json
git commit -m "perf(web): keep case tab components out of shell routes"
```

---

### Task 3: Stop the landing page shipping the whole `@asc/ui` kit

**Files:**
- Modify: `packages/ui/package.json` (add `sideEffects`)
- Modify: `apps/web/src/features/landing/landing-nav.tsx:2`, `landing-hero.tsx:3`, `workflow-section.tsx:2`, `section-heading.tsx:2`, `cta-section.tsx:2`
- Modify: `apps/web/src/app/(marketing)/loading.tsx:1`
- Modify: `apps/web/perf/perf-budget.json`

**Interfaces:**
- Consumes: `test:bundles` (Task 1). Leaf subpaths already exported by `@asc/ui`: `./components/*` → `src/components/*.tsx`, `./lib/*` → `src/lib/*.ts`.
- Produces: nothing new; the same components through leaf paths.

Why both changes: when a **Server Component** imports the barrel, every `"use client"` module it re-exports becomes a client reference for that page. Leaf imports fix that edge. `sideEffects` then lets the bundler drop the unused re-exports that the remaining client-side barrel imports pull in. In the trial, neither change helped on its own; together they did.

- [ ] **Step 1: Write the failing rule**

Add to `forbidden`:
```json
    { "string": "Signature captured", "notIn": ["/"], "reason": "the landing page must not ship the clinical kit (SignaturePad)" }
```

- [ ] **Step 2: Run it to verify it fails**

Build, `pnpm --filter web test:bundles`. Expected: FAIL with offending `["/"]`.

- [ ] **Step 3: Declare the package side-effect free except CSS**

`packages/ui/package.json`, after `"type": "module",`:
```json
  "sideEffects": ["**/*.css"],
```

- [ ] **Step 4: Switch the landing Server Components to leaf imports**

| File | Old import | New imports |
|---|---|---|
| `landing-nav.tsx` | `import { Button, ThemeToggle } from "@asc/ui";` | `import { Button } from "@asc/ui/components/ui/button";` + `import { ThemeToggle } from "@asc/ui/components/theme/theme-toggle";` |
| `landing-hero.tsx` | `import { Button, cn } from "@asc/ui";` | `import { Button } from "@asc/ui/components/ui/button";` + `import { cn } from "@asc/ui/lib/utils";` |
| `workflow-section.tsx` | `import { AiBadge, PhaseChip } from "@asc/ui";` | `import { AiBadge } from "@asc/ui/components/clinical/ai-badge";` + `import { PhaseChip } from "@asc/ui/components/clinical/phase-chip";` |
| `section-heading.tsx` | `import { cn } from "@asc/ui";` | `import { cn } from "@asc/ui/lib/utils";` |
| `cta-section.tsx` | `import { Button } from "@asc/ui";` | `import { Button } from "@asc/ui/components/ui/button";` |
| `app/(marketing)/loading.tsx` | `import { LoadingSkeleton } from "@asc/ui";` | `import { LoadingSkeleton } from "@asc/ui/components/clinical/loading-skeleton";` |

Leave client components (`"use client"` files) on the barrel. They measured fine once `sideEffects` is set.

- [ ] **Step 5: Run the test to verify it passes**

Build, `pnpm --filter web test:bundles`. Expected: PASS. Trial expectation: `/` about 350 → 294 KB gz.

- [ ] **Step 6: Check in the browser (LM-005, Review Focus 5)**

`pnpm --filter web dev`:
- `/`: nav, theme toggle (switch light/dark), hero buttons, workflow chips, CTA all render and work; the walkthrough player tooltips appear on hover;
- `/login`: toast on a failed demo login still shows (stop MSW by setting `NEXT_PUBLIC_API_MOCKING=disabled` in `.env.local`, or check that any toast still renders);
- signed in: open a dialog (⌘K palette) and a dropdown (user menu).

- [ ] **Step 7: Lint, typecheck, commit**

```bash
pnpm --filter @asc/ui lint && pnpm --filter web lint && pnpm --filter web check-types
git add packages/ui/package.json apps/web/src/features/landing apps/web/src/app/\(marketing\)/loading.tsx apps/web/perf/perf-budget.json
git commit -m "perf(web): landing imports @asc/ui leaf paths; mark @asc/ui side-effect free"
```

---

### Task 4: Start MSW only where the API is used

**Files:**
- Modify: `apps/web/src/app/providers.tsx`
- Modify: `apps/web/src/app/(auth)/layout.tsx`
- Modify: `apps/web/src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `MockProvider` from `apps/web/src/mocks/mock-provider.tsx` (unchanged: suspends until the worker is ready when mocking is on, renders children immediately otherwise).
- Produces: nothing new.

The bundle test can't see this, because the MSW chunks are loaded at runtime and are not referenced in the HTML. The check is the landing page's network log.

- [ ] **Step 1: Record the failing check**

Demo build (§2), start on :3101, then:
```bash
cd apps/web
# "[MSW]" appears only in the msw library chunk; "onUnhandledRequest" also matches MockProvider's own app chunk.
MSW_CHUNKS=$(grep -l "\[MSW\]" .next/static/chunks/*.js | xargs -n1 basename | paste -sd'|' -)
npx -y lighthouse@13.5.0 http://localhost:3101/ --quiet --chrome-flags="--headless=new" --only-categories=performance --output=json --output-path=/tmp/lh/msw-home.json
jq -r --arg re "$MSW_CHUNKS" '[.audits["network-requests"].details.items[].url | select(test($re))] | length' /tmp/lh/msw-home.json
```
Expected: `1` (the MSW library chunk, ~122 KB transferred, requested by the landing page).

- [ ] **Step 2: Remove MockProvider from the root providers**

`apps/web/src/app/providers.tsx`: delete the `import { MockProvider } from "../mocks/mock-provider";` line, and replace the return with:
```tsx
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          {children}
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
```

- [ ] **Step 3: Wrap the auth page area**

`apps/web/src/app/(auth)/layout.tsx`: add `import { MockProvider } from "@/mocks/mock-provider";` and change
```tsx
          <div className="w-full max-w-md">{children}</div>
```
to
```tsx
          <div className="w-full max-w-md">
            <MockProvider>{children}</MockProvider>
          </div>
```
The brand panel, header and footer render without waiting for the worker.

- [ ] **Step 4: Wrap the signed-in shell**

`apps/web/src/app/(dashboard)/layout.tsx`: add `import { MockProvider } from "@/mocks/mock-provider";` and wrap the whole returned tree:
```tsx
  return (
    <MockProvider>
      <RequireAuth>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="min-w-0 bg-background">
            <TopBar />
            <div className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-20 sm:px-6 lg:px-8">{children}</div>
          </SidebarInset>
          <GuideLayer />
        </SidebarProvider>
      </RequireAuth>
    </MockProvider>
  );
```
It goes above `RequireAuth` because the top bar, command menu and guide layer all query the API.

- [ ] **Step 5: Run the check to verify it passes**

Rebuild, restart, repeat Step 1's commands. Expected: `0` on `/`. Repeat with `http://localhost:3101/login`: expected `1` (mocks still start where they are needed). Then run the §2 Lighthouse set. Expectation: `/` unused JS 166 → about 121 KiB.

- [ ] **Step 6: Check in the browser (Review Focus 3 and 4)**

Production demo build on :3101 (MSW behaves differently in dev):
- `/` → click "Sign in": the landing page stays visible until `/login` renders with 5 persona cards (no blank screen);
- demo-login as Front desk → dashboard data loads;
- hard reload on `/schedule`: you land on `/login` (the session is in memory, by design per LM-004), and after demo login `/schedule` shows mocked data;
- `pnpm --filter web test:bundles` still passes.

- [ ] **Step 7: Lint, typecheck, commit**

```bash
pnpm --filter web lint && pnpm --filter web check-types
git add apps/web/src/app/providers.tsx "apps/web/src/app/(auth)/layout.tsx" "apps/web/src/app/(dashboard)/layout.tsx"
git commit -m "perf(web): start MSW only in auth and signed-in route groups"
```

---

### Task 5: Inline CSS, kept only if it measures better

**Files:**
- Modify: `apps/web/next.config.ts`

**Interfaces:** none.

Read `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/inlineCss.md` first. It is experimental, global, and production-only. It removes the stylesheet waterfall but stops browsers caching CSS separately from HTML. This app is mostly client-side navigation after the first load, where Next uses `<link>` tags anyway.

- [ ] **Step 1: Baseline after Tasks 2–4**

Run the full §2 Lighthouse set on the build from Task 4 and save the medians table.

- [ ] **Step 2: Enable inlining**

`apps/web/next.config.ts`, inside `nextConfig` after `transpilePackages`:
```ts
  // Inline CSS in first-load HTML: removes 3 render-blocking stylesheet requests (Lighthouse ~450 ms mobile FCP estimate).
  experimental: { inlineCss: true },
```

- [ ] **Step 3: Measure**

Rebuild, restart, run the §2 Lighthouse set.
Keep the change only if **all** hold:
- `render-blocking` median ≈ 0 on `/` and `/login`;
- mobile FCP median lower than Step 1 by more than 20 ms (baseline spread was under 10 ms);
- mobile LCP median not higher than Step 1;
- `/` HTML grows by no more than the CSS it inlines (about 25 KB gz). Check `curl -s --compressed -o /dev/null -w "%{size_download}\n" http://localhost:3101/` before and after.

Otherwise revert `next.config.ts` and record the numbers in PROGRESS.md as "evaluated, not adopted".

- [ ] **Step 4: Browser check and commit (if kept)**

Check `/`, `/login` and a signed-in page in light and dark themes for unstyled flashes, then:
```bash
pnpm --filter web lint && pnpm --filter web check-types
git add apps/web/next.config.ts
git commit -m "perf(web): inline first-load CSS (measured: <FCP before → after>)"
```
Put the measured FCP values in the commit message.

---

### Task 6: Lock in budgets and record results

**Files:**
- Modify: `apps/web/perf/perf-budget.json`
- Modify: `PROGRESS.md`

- [ ] **Step 1: Set budgets from the post-fix build**

Build (§2). Get each route's initial JS (skill script, or set `"*": 1` temporarily and read the failure list, which prints every route's size). Set:
```json
  "budgetsKbGz": { "/": <measured / plus 5%, rounded up>, "/login": <same rule>, "*": <largest signed-in route plus 5%, rounded up> }
```
using the numbers you measured. Never copy numbers from this plan.

- [ ] **Step 2: Verify the budget bites**

Temporarily lower `"/"` by 20 KB and run `pnpm --filter web test:bundles`. Expected: FAIL naming `/`. Restore it, then run again. Expected: PASS.

- [ ] **Step 3: Update PROGRESS.md**

§3 Done log, newest first:
```markdown
| 2026-10-xx | Web perf | Case tabs out of shell routes, landing on @asc/ui leaf imports + sideEffects, MSW scoped to auth/dashboard, inline CSS <adopted/not adopted>; bundle guard `pnpm --filter web test:bundles` with budgets. /dashboard <before → after> KB gz, / <before → after> KB gz, mobile FCP <before → after> | PR #… |
```
§5 Next up: add "Wire `pnpm --filter web build && pnpm --filter web test:bundles` and Lighthouse CI into P01 CI."

- [ ] **Step 4: Commit**

```bash
git add apps/web/perf/perf-budget.json PROGRESS.md
git commit -m "chore(web): bundle budgets from measured baseline; progress"
```

---

## 4. Open questions (decide before or alongside)

| ID | Question | Blocks | Default if unanswered |
|---|---|---|---|
| Q1 | The hero `<h1>` fades in from `opacity: 0` + blur over 0.9 s (`.rise`), so it is invisible at first paint and is never the LCP element. Keep the effect, or animate only `transform` for the headline so it shows at first paint? This is a design call. | none | Keep as is; revisit after field data exists |
| Q2 | When the persona API fails, `/login` shifts (CLS 0.285 lab) because 5 skeletons collapse into one error line inside a vertically centred column. Reserve the list height in the error state? | none | Fix in a small follow-up: render the error inside the list area with the same min-height as 5 cards |
| Q3 | Signed-in pages render only after JS, auth state and the data fetch, one after another. Moving first paint to the server depends on server-side auth. | P05 | Defer to P05; no change here |
| Q4 | Field data: wire `web-vitals` (route pattern only, no PHI) to `@asc/telemetry`? Needs a collector endpoint. | none | Defer to P01/P26 |

## 5. Out of scope

- Converting every `@asc/ui` barrel import in the app (only the landing Server Components are proven to matter).
- `next/dynamic` wrapping of components. Not needed once the import edges are cut; re-evaluate with the bundle test if a route grows.
- Debouncing ⌘K search (backend load, no measured user impact).
- CI wiring (no CI exists yet; P01).
