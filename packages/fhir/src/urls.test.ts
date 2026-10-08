import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { assertCanonicalBase, createFhirUrls, FHIR_CANONICAL_BASE, fhirUrls } from "./urls.js";

describe("canonical base", () => {
  it("is the decided base (issue #54)", () => {
    expect(FHIR_CANONICAL_BASE).toBe("https://fhir.wybit.io/asc/");
  });

  it("builds every kind of canonical URL from the base", () => {
    expect(fhirUrls).toMatchObject({ base: "https://fhir.wybit.io/asc/" });
    expect(fhirUrls.structureDefinition("case-phase")).toBe("https://fhir.wybit.io/asc/StructureDefinition/case-phase");
    expect(fhirUrls.codeSystem("case-phase")).toBe("https://fhir.wybit.io/asc/CodeSystem/case-phase");
    expect(fhirUrls.valueSet("case-phase")).toBe("https://fhir.wybit.io/asc/ValueSet/case-phase");
    expect(fhirUrls.identifierSystem("mrn")).toBe("https://fhir.wybit.io/asc/identifier/mrn");
  });

  it("uses a different base when one is passed in, for every URL", () => {
    const other = createFhirUrls("https://fhir.example.test/x/");
    expect(other.structureDefinition("a")).toBe("https://fhir.example.test/x/StructureDefinition/a");
    expect(other.identifierSystem("a")).toBe("https://fhir.example.test/x/identifier/a");
  });
});

describe("validation", () => {
  it.each([
    ["http instead of https", "http://fhir.wybit.io/asc/"],
    ["no trailing slash", "https://fhir.wybit.io/asc"],
    ["a query", "https://fhir.wybit.io/asc/?a=1"],
    ["a fragment", "https://fhir.wybit.io/asc/#top"],
    ["not a URL", "fhir.wybit.io/asc/"],
    ["empty", ""],
  ])("rejects a base with %s", (_label, base) => {
    expect(() => assertCanonicalBase(base)).toThrow("FHIR canonical base");
    expect(() => createFhirUrls(base)).toThrow("FHIR canonical base");
  });

  it.each(["", "Case-Phase", "case phase", "../x", "a--b", "-a", "a-", "a/b", "a_b"])("rejects the name %j", (name) => {
    expect(() => fhirUrls.structureDefinition(name)).toThrow("invalid canonical name");
    expect(() => fhirUrls.identifierSystem(name)).toThrow("invalid canonical name");
  });
});

describe("the base is defined once", () => {
  // Every URL is built from urls.ts. A copy of the host anywhere else would survive a change of base.
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const SKIP = new Set(["node_modules", ".next", "dist", ".turbo", "coverage"]);

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (SKIP.has(entry.name)) return [];
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx|mjs|js|json)$/.test(entry.name) ? [path] : [];
    });
  }

  it("appears as a literal only in urls.ts and in tests", () => {
    const offenders: string[] = [];
    for (const area of ["packages", "apps"]) {
      for (const workspace of readdirSync(join(root, area))) {
        const src = join(root, area, workspace, "src");
        if (!existsSync(src)) continue;
        for (const file of sourceFiles(src)) {
          const name = relative(root, file);
          if (name === "packages/fhir/src/urls.ts" || /\.test\.tsx?$/.test(name)) continue;
          if (readFileSync(file, "utf8").includes("fhir.wybit.io")) offenders.push(name);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
