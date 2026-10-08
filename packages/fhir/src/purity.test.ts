import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = dirname(fileURLToPath(import.meta.url));
// No environment, no network, no node built-ins (the package also runs in the browser).
const FORBIDDEN = [/process\.env/, /\bfetch\(/, /from "node:/];

const sourceFiles = () =>
  (readdirSync(srcDir, { recursive: true }) as string[]).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));

describe("@asc/fhir purity", () => {
  it("source files do no I/O and read no environment (LM-006)", () => {
    for (const file of sourceFiles()) {
      const text = readFileSync(join(srcDir, file), "utf8");
      for (const pattern of FORBIDDEN) expect(text, `${file} matches ${pattern}`).not.toMatch(pattern);
    }
  });

  it("imports @medplum and @asc/types as types only, so no library code reaches a bundle", () => {
    for (const file of sourceFiles()) {
      const text = readFileSync(join(srcDir, file), "utf8");
      for (const match of text.matchAll(/^(import|export)\s+(type\s+)?[^;]*?from\s+"(@medplum\/[^"]+|@asc\/types)"/gms)) {
        expect(match[2], `${file}: ${match[3]} must be a type-only import`).toBeDefined();
      }
    }
  });

  it("never writes the deprecated singular meta.account: builders tag facilities with meta.accounts (LM-022)", () => {
    for (const file of sourceFiles()) {
      expect(readFileSync(join(srcDir, file), "utf8"), file).not.toMatch(/\baccount\s*:/);
    }
  });

  it("depends only on the FHIR and domain types", () => {
    const pkg = JSON.parse(readFileSync(join(srcDir, "..", "package.json"), "utf8")) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies).sort()).toEqual(["@asc/types", "@medplum/fhirtypes"]);
  });
});
