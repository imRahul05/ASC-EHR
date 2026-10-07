/**
 * Bundles each bot in src/*.ts into dist/<name>.js, the single-file form the Medplum
 * bot runtime runs (CommonJS, Node). Test files are not bots. With no bot yet, the
 * build succeeds and says so: the first bots arrive with P08/P12.
 */

import { readdirSync } from "node:fs";
import { build } from "esbuild";

const entryPoints = readdirSync("src")
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".d.ts"))
  .map((name) => `src/${name}`);

if (entryPoints.length === 0) {
  process.stdout.write("bots: no bots in src/ yet, nothing to build\n");
} else {
  await build({
    entryPoints,
    outdir: "dist",
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    sourcemap: true,
    logLevel: "info",
  });
}
