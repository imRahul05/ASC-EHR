/**
 * Bundles each bot in src/*.ts into dist/<name>.js, the single-file form the Medplum
 * bot runtime runs (CommonJS, Node). Test files are not bots. With no bot yet, the
 * build succeeds and says so: the first bots arrive with P08/P12.
 *
 * Paths are resolved from this file, not from the working directory, so the build also
 * works when started from the repo root or by an orchestrator that sets no cwd.
 */

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const srcDir = fileURLToPath(new URL("src/", import.meta.url));
const outDir = fileURLToPath(new URL("dist/", import.meta.url));

const entryPoints = readdirSync(srcDir)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".d.ts"))
  .map((name) => `${srcDir}${name}`);

if (entryPoints.length === 0) {
  process.stdout.write("bots: no bots in src/ yet, nothing to build\n");
} else {
  await build({
    entryPoints,
    outdir: outDir,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    sourcemap: true,
    logLevel: "info",
  });
}
