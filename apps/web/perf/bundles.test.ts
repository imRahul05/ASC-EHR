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
