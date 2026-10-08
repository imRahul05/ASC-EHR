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
    const leaves = new Set(Object.values(pkg.exports).map((target) => target.replace("./src/", "")));
    for (const file of files) expect(leaves, `${file} needs a leaf export`).toContain(file);
  });

  it("keeps relative runtime imports out of every leaf file", () => {
    const offenders = files.flatMap((file) => runtimeImports(file).filter((specifier) => specifier.startsWith(".")).map((specifier) => `${file}: ${specifier}`));
    expect(offenders).toEqual([]);
  });

  it("only imports sibling leaves that are exported", () => {
    for (const file of files) {
      for (const specifier of runtimeImports(file).filter((s) => s.startsWith(`${pkg.name}/`))) {
        expect(pkg.exports, `${file} imports ${specifier}`).toHaveProperty([`./${specifier.slice(pkg.name.length + 1)}`]);
      }
    }
  });
});
