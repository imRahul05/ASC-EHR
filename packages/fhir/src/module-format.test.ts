import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Why (LM-005): the browser bundler cannot map a relative ".js" import to its ".ts" source, while apps/api
// and the worker type-check under NodeNext. So every file a browser reaches through a leaf export
// ("@asc/fhir/urls", ...) imports its siblings by their leaf name, never by relative path. Only the root
// barrel (index.ts, used by Node code) may use relative paths.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { name: string; exports: Record<string, string> };
const files = (readdirSync(join(root, "src"), { recursive: true }) as string[]).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && file !== "index.ts");

function runtimeImports(file: string): string[] {
  const text = readFileSync(join(root, "src", file), "utf8");
  return [...text.matchAll(/^(import|export)\s+(type\s+)?[^;]*?from\s+"([^"]+)"/gms)].filter((match) => match[2] === undefined).map((match) => match[3] ?? "");
}

describe("@asc/fhir module format", () => {
  it("exposes every non-index source file as a leaf export", () => {
    // "./builders/*": "./src/builders/*.ts" covers every file in src/builders.
    const exact = new Set(Object.values(pkg.exports).filter((target) => !target.includes("*")).map((target) => target.replace("./src/", "")));
    const wildcard = Object.values(pkg.exports).filter((target) => target.includes("*")).map((target) => target.replace("./src/", "").split("*")[0] ?? "");
    for (const file of files) {
      expect(exact.has(file) || wildcard.some((prefix) => file.startsWith(prefix)), `${file} needs a leaf export`).toBe(true);
    }
  });

  it("keeps relative runtime imports out of every leaf file", () => {
    const offenders = files.flatMap((file) => runtimeImports(file).filter((specifier) => specifier.startsWith(".")).map((specifier) => `${file}: ${specifier}`));
    expect(offenders).toEqual([]);
  });

  it("only imports sibling leaves that are exported", () => {
    for (const file of files) {
      for (const specifier of runtimeImports(file).filter((s) => s.startsWith(`${pkg.name}/`))) {
        const leaf = `./${specifier.slice(pkg.name.length + 1)}`;
        const covered = Object.hasOwn(pkg.exports, leaf) || Object.hasOwn(pkg.exports, `${leaf.split("/").slice(0, -1).join("/")}/*`);
        expect(covered, `${file} imports ${specifier}`).toBe(true);
      }
    }
  });
});
