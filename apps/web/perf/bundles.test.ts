// Bundle guard for apps/web. Reads the production build in .next, so run `next build` first:
//   pnpm --filter web build && pnpm --filter web test:bundles
// Rules live in perf/perf-budget.json. Each forbidden string must still exist in some chunk;
// otherwise the copy changed and the rule would pass while guarding nothing.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
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
  /** Max gzipped entry JS in KB for dynamic (not prerendered) routes, read from their client reference manifest. */
  readonly dynamicBudgetsKbGz: Readonly<Record<string, number>>;
  readonly forbidden: readonly ForbiddenRule[];
}

interface ClientReferenceManifest {
  readonly entryJSFiles?: Readonly<Record<string, readonly string[]>>;
}

interface ManifestSandbox {
  [key: string]: ManifestSandbox | Record<string, ClientReferenceManifest> | undefined;
  globalThis?: ManifestSandbox;
  __RSC_MANIFEST?: Record<string, ClientReferenceManifest>;
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

const CASE_MANIFEST_PATH = path.join(
  DOT_NEXT,
  "server/app/(dashboard)/cases/[caseId]/page_client-reference-manifest.js",
);
const CASE_PAGE_ENTRY_KEY = "[project]/apps/web/src/app/(dashboard)/cases/[caseId]/page";

function loadCaseEntryChunks(manifestPath: string): readonly string[] {
  const code = readFileSync(manifestPath, "utf8");
  const sandbox: ManifestSandbox = {};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox);
  const manifest = sandbox.__RSC_MANIFEST?.["/(dashboard)/cases/[caseId]/page"];
  const rawChunks = manifest?.entryJSFiles?.[CASE_PAGE_ENTRY_KEY] ?? [];
  return [...new Set(rawChunks.map((chunk) => chunk.replace(/^\/?(?:_next\/)?/, "")))];
}

const hasCaseManifest = existsSync(CASE_MANIFEST_PATH);
const caseEntryChunks = hasCaseManifest ? loadCaseEntryChunks(CASE_MANIFEST_PATH) : [];

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

  it("names only prerendered routes in perf-budget.json (rules are not stale)", () => {
    const known = new Set(routes.map((r) => r.route));
    const named = [
      ...Object.keys(budget.budgetsKbGz).filter((route) => route !== "*"),
      ...budget.forbidden.flatMap((rule) => (rule.notIn === "*" ? [] : rule.notIn)),
    ];
    const unknown = named.filter((route) => !known.has(route));
    expect(unknown, "these routes are not prerendered (typo, or now dynamic): update perf-budget.json").toEqual([]);
  });

  it("keeps every prerendered route within its initial JS budget", () => {
    const over = routes.flatMap(({ route, chunks }) => {
      const limit = budget.budgetsKbGz[route] ?? budget.budgetsKbGz["*"];
      const kb = gzKb(chunks);
      return limit !== undefined && kb > limit ? [`${route}: ${kb.toFixed(1)} KB gz > ${limit} KB`] : [];
    });
    expect(over).toEqual([]);
  });

  describe("dynamic route /cases/[caseId]", () => {
    it("does not bundle case workspace tab content into starting entry chunks", () => {
      if (!hasCaseManifest) {
        expect(hasBuild).toBe(false);
        return;
      }
      expect(caseEntryChunks.length).toBeGreaterThan(0);
      const offending = caseEntryChunks.filter((chunk) =>
        chunkSource(chunk).toString("utf8").includes("Retroflexion in rectum"),
      );
      expect(offending, "Case tabs leaked into /cases/[caseId] starting entry chunks").toEqual([]);
    });

    it("keeps starting entry chunks within the dynamicBudgetsKbGz budget", () => {
      if (!hasCaseManifest) {
        expect(hasBuild).toBe(false);
        return;
      }
      const limit = budget.dynamicBudgetsKbGz["/cases/[caseId]"];
      expect(limit, 'perf-budget.json needs dynamicBudgetsKbGz["/cases/[caseId]"]').toBeDefined();
      expect(caseEntryChunks.length).toBeGreaterThan(0);
      const kb = gzKb(caseEntryChunks);
      expect(kb, `/cases/[caseId]: ${kb.toFixed(1)} KB gz > ${limit} KB`).toBeLessThanOrEqual(limit ?? 0);
    });
  });
});
