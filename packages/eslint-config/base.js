import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import turboPlugin from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";
import { ascPlugin } from "./plugin.js";
import { ROLE_CHECK_BASELINE } from "./role-check-baseline.js";

/** Env is read only inside @asc/config (parseEnv / publicEnv / getProcessEnv). */
export const PROCESS_ENV_RULE = [
  "error",
  {
    object: "process",
    property: "env",
    message: "Read env through @asc/config (parseEnv, publicEnv, getProcessEnv) — only @asc/config touches process.env.",
  },
];

/**
 * A shared ESLint configuration for the repository.
 *
 * Type-aware (typescript-eslint) so the repo rules in docs/agent/architecture.md
 * are enforced, not just documented: no `any`, no `console`, no floating promises.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const config = tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "*.config.*", "eslint.config.*"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      "turbo/no-undeclared-env-vars": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": "error",
      // Env is read only inside @asc/config (parseEnv / publicEnv / getProcessEnv).
      "no-restricted-properties": PROCESS_ENV_RULE,
    },
  },
  {
    files: ["**/*.test.ts", "**/*.spec.ts"],
    rules: {
      "no-restricted-properties": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
    },
  },
  {
    // Code checks capabilities with can(), never role names (P05). Baseline
    // files are exempt until P05d empties the list.
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { asc: ascPlugin },
    rules: { "asc/no-role-name-comparison": "error" },
  },
  ...(ROLE_CHECK_BASELINE.length > 0
    ? [{ files: ROLE_CHECK_BASELINE, rules: { "asc/no-role-name-comparison": "off" } }]
    : []),
  eslintConfigPrettier,
);
