import { defineConfig } from "vitest/config";

// P03 acceptance: 100 % test coverage on the builders. The whole package is held to it: it is small, pure and
// carries the identifiers and URLs that end up inside every stored resource. `pnpm test` fails below the bar.
export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      reporter: ["text-summary"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
