import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Why this exists (LM-005, LM-014): apps/api and the worker type-check with NodeNext, which
// needs ".js" on relative imports; the browser bundler (Turbopack) cannot map ".js" to ".ts".
// So the package is written for NodeNext, and everything the browser reaches through a leaf
// export ("@asc/authz/can", "/grants", "/roles", "/workspaces") imports its siblings by leaf name.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

interface PackageJson {
  readonly name: string;
  readonly exports: Readonly<Record<string, string>>;
}
const pkg = JSON.parse(read("package.json")) as PackageJson;

const isSource = (file: string) => file.endsWith(".ts") && !file.endsWith(".test.ts");
const listRoles = () =>
  readdirSync(join(root, "src/roles"))
    .filter(isSource)
    .map((file) => `src/roles/${file}`);

// Runtime (non-type) import specifiers of a file.
function runtimeImports(path: string): string[] {
  const text = read(path);
  const found: string[] = [];
  for (const match of text.matchAll(/^(import|export)\s+(type\s+)?[^;]*?from\s+"([^"]+)"/gms)) {
    if (match[2] === undefined) found.push(match[3] ?? "");
  }
  return found;
}

// Files reachable from the leaf exports (minus the Node-only root barrel and test fakes),
// following self-references such as "@asc/authz/can".
function browserReachableFiles(): string[] {
  const leafTargets = Object.entries(pkg.exports)
    .filter(([name]) => name !== "." && name !== "./testing" && !name.includes("*"))
    .map(([, target]) => target.replace("./", ""));
  const queue = [...leafTargets, ...listRoles()];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    for (const specifier of runtimeImports(file)) {
      if (!specifier.startsWith(`${pkg.name}/`)) continue;
      const leaf = `./${specifier.slice(pkg.name.length + 1)}`;
      const exact = pkg.exports[leaf];
      const wildcard = pkg.exports[`${leaf.split("/").slice(0, -1).join("/")}/*`];
      const target = exact ?? wildcard?.replace("*", leaf.split("/").pop() ?? "");
      if (target !== undefined) queue.push(target.replace("./", ""));
    }
  }
  return [...seen];
}

describe("@asc/authz module format", () => {
  it("type-checks under NodeNext: its tsconfig does not override module settings", () => {
    const tsconfig = JSON.parse(read("tsconfig.json")) as { compilerOptions: Record<string, unknown> };
    expect(tsconfig.compilerOptions).not.toHaveProperty("module");
    expect(tsconfig.compilerOptions).not.toHaveProperty("moduleResolution");
    expect(tsconfig.compilerOptions).not.toHaveProperty("allowImportingTsExtensions");
    const base = readFileSync(join(root, "../typescript-config/base.json"), "utf8");
    expect(base).toContain('"moduleResolution": "NodeNext"');
  });

  it("covers every browser leaf the web app uses", () => {
    const files = browserReachableFiles();
    for (const file of ["src/can.ts", "src/grants.ts", "src/workspaces.ts", "src/roles/index.ts", "src/roles/rules.ts"]) {
      expect(files).toContain(file);
    }
  });

  it("keeps relative runtime imports out of every file a leaf reaches", () => {
    const offenders: string[] = [];
    for (const file of browserReachableFiles()) {
      for (const specifier of runtimeImports(file)) {
        if (specifier.startsWith(".")) offenders.push(`${relative(root, join(root, file))} imports ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
