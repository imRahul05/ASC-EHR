import { defineConfig } from "tsup";

/**
 * Internal @repo/* packages are "just-in-time" (they export raw .ts), so they
 * MUST be bundled. The app's own dependencies (fastify, zod, ...) stay external
 * and are resolved from node_modules at runtime. Third-party deps used by
 * internal packages (pino, @opentelemetry/*) are declared in this app's
 * package.json too, so they stay external as well.
 */
export default defineConfig({
  entry: ["src/server.ts", "src/instrumentation.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: true,
  noExternal: [/^@repo\//],
  // Bundled CJS deps (e.g. pino) call require(); provide it in the ESM output.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
