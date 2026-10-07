import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CONFIG = fileURLToPath(new URL("../../esbuild.config.mjs", import.meta.url));

describe("esbuild.config.mjs", () => {
  it("builds from any working directory, not only apps/bots", () => {
    const elsewhere = mkdtempSync(join(tmpdir(), "asc-esbuild-"));
    const output = execFileSync(process.execPath, [CONFIG], { cwd: elsewhere, encoding: "utf8" });
    expect(output).toContain("no bots in src/ yet");
  });
});
