/**
 * Fixture tests for the app boundary rules (LEARNING_MISTAKES.md LM-001, LM-005, LM-006):
 * lint small probe files through the real config blocks and assert which rules fire.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { appBoundaryConfig } from "../app.js";
import { PROCESS_ENV_RULE } from "../base.js";

/** @param {{ browser?: boolean }} options */
function linter(options) {
  return new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.ts", "**/*.tsx"],
        languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
        rules: { "no-restricted-properties": PROCESS_ENV_RULE },
      },
      ...appBoundaryConfig(options),
    ],
  });
}

/** @returns {Promise<string[]>} "ruleId:line" for each message */
async function lint(code, { browser = false, file = "src/probe.tsx" } = {}) {
  const [result] = await linter({ browser }).lintText(code, { filePath: file });
  return (result?.messages ?? []).map((m) => `${m.ruleId}:${m.line}`);
}

describe("app boundary rules", () => {
  it("blocks libraries that a package already wraps", async () => {
    const code = [
      'import axios from "axios";',
      'import { z } from "zod";',
      'import { Sun } from "lucide-react";',
      'import { useTheme } from "next-themes";',
      'import * as Dialog from "@radix-ui/react-dialog";',
      'import { anthropic } from "@ai-sdk/anthropic";',
    ].join("\n");
    assert.deepEqual(await lint(code), [1, 2, 3, 4, 5, 6].map((line) => `no-restricted-imports:${line}`));
  });

  it("blocks exported types and Zod schemas in apps", async () => {
    const code = [
      "export interface Leaked { id: string }",
      "export type AlsoLeaked = { id: string };",
      "const schema = z.object({});",
      "interface Props { id: string }",
    ].join("\n");
    assert.deepEqual(await lint(code), [
      "no-restricted-syntax:1",
      "no-restricted-syntax:2",
      "no-restricted-syntax:3",
    ]);
  });

  it("blocks process.env outside @asc/config", async () => {
    assert.deepEqual(await lint("const url = process.env.API_URL;"), ["no-restricted-properties:1"]);
  });

  it("requires leaf subpaths of Node-style packages in browser code only", async () => {
    const code = [
      'import { loginSchema } from "@asc/validation";',
      'import { API_ROUTES } from "@asc/config";',
      'import { can } from "@asc/authz";',
    ].join("\n");
    assert.deepEqual(await lint(code, { browser: true }), [1, 2, 3].map((line) => `no-restricted-imports:${line}`));
    assert.deepEqual(await lint(code, { browser: false }), []);
  });

  it("allows the sanctioned alternatives", async () => {
    const code = [
      'import { http } from "@asc/api-client";',
      'import { loginSchema } from "@asc/validation/auth";',
      'import { API_ROUTES } from "@asc/config/api";',
      'import { can } from "@asc/authz/can";',
      'import { Sun } from "@asc/ui/icons";',
      'import { ThemeToggle } from "@asc/ui";',
      "interface Props { readonly id: string }",
    ].join("\n");
    assert.deepEqual(await lint(code, { browser: true }), []);
  });

  it("bans @asc/ui root barrel in routes, auth, and landing components (LM-011)", async () => {
    const barrelCode = 'import { ThemeToggle } from "@asc/ui";';
    const leafCode = 'import { ThemeToggle } from "@asc/ui/components/theme/theme-toggle";';

    for (const file of [
      "src/app/page.tsx",
      "src/components/auth/card.tsx",
      "src/features/landing/hero.tsx",
    ]) {
      assert.deepEqual(
        await lint(barrelCode, { browser: true, file }),
        ["no-restricted-imports:1"],
      );
      assert.deepEqual(
        await lint(leafCode, { browser: true, file }),
        [],
      );
    }

    assert.deepEqual(
      await lint(barrelCode, { browser: true, file: "src/features/case/tab.tsx" }),
      [],
    );
    assert.deepEqual(
      await lint(leafCode, { browser: true, file: "src/features/case/tab.tsx" }),
      [],
    );
  });

  it("asserts all packages in packages/* declare sideEffects in package.json", () => {
    const packagesDir = fileURLToPath(new URL("../..", import.meta.url));
    const entries = readdirSync(packagesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    assert.ok(entries.length > 0, "must find packages in packages/*");

    for (const pkg of entries) {
      const pkgJsonPath = path.join(packagesDir, pkg, "package.json");
      assert.ok(existsSync(pkgJsonPath), `packages/${pkg}/package.json must exist`);
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
      const isExplicitFalse = pkgJson.sideEffects === false;
      const isNonEmptyArray = Array.isArray(pkgJson.sideEffects) && pkgJson.sideEffects.length > 0;
      assert.ok(
        isExplicitFalse || isNonEmptyArray,
        `packages/${pkg} must declare sideEffects as false or non-empty string[] (got ${JSON.stringify(pkgJson.sideEffects)})`,
      );
    }
  });

  it("only applies to app source files", async () => {
    assert.deepEqual(await lint('import axios from "axios";', { file: "scripts/tool.ts" }), []);
  });
});
