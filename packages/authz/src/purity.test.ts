import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = dirname(fileURLToPath(import.meta.url));
const FORBIDDEN = [/process\.env/, /\bfetch\(/, /from "node:(?!$)/, /from "@medplum\//];

describe("@asc/authz purity", () => {
  it("source files do no I/O and read no environment", () => {
    const files = readdirSync(srcDir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    for (const file of files) {
      const text = readFileSync(join(srcDir, file), "utf8");
      for (const pattern of FORBIDDEN) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("depends only on @asc/types", () => {
    const pkg = JSON.parse(readFileSync(join(srcDir, "..", "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies)).toEqual(["@asc/types"]);
  });
});
