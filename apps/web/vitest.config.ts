import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for web logic (guards, nav, mock identities). Page loading is checked in `pnpm dev`.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node" },
});
