import { config as baseConfig } from "./base.js";

/**
 * Browser bundles (Next.js/Turbopack) must import leaf subpaths of the Node-style
 * packages: their root entries re-export with NodeNext ".js" specifiers that
 * Turbopack cannot map back to ".ts".
 */
export const BROWSER_ENTRY_POINT_PATHS = [
  {
    name: "@asc/validation",
    message: "In browser code import a subpath, e.g. @asc/validation/auth.",
  },
  {
    name: "@asc/config",
    message:
      "In browser code import a subpath: @asc/config/public-env or @asc/config/api.",
  },
  {
    name: "@asc/authz",
    message:
      "In browser code import a leaf: @asc/authz/can, /grants, /roles or /workspaces (the root barrel uses NodeNext .js re-exports).",
  },
];

const APP_RESTRICTED_PATHS = [
  {
    name: "axios",
    message: "Use the request functions / http client from @asc/api-client.",
  },
  { name: "zod", message: "Schemas live in @asc/validation." },
  { name: "lucide-react", message: "Import icons from @asc/ui/icons." },
  {
    name: "next-themes",
    message: "Use ThemeProvider / ThemeToggle from @asc/ui.",
  },
  {
    name: "cmdk",
    message: "Depends on Radix; use the Base UI Combobox via @asc/ui.",
  },
  {
    name: "@medplum/react",
    message: "Mantine-based; use @medplum/react-hooks + @asc/ui.",
  },
  { name: "ai", message: "LLM calls only in @asc/agents." },
  { name: "pino", message: "Use @asc/logger." },
  { name: "drizzle-orm", message: "Database access lives in @asc/db." },
];

const ROUTE_RESTRICTED_PATHS = [
  {
    name: "@asc/ui",
    message:
      "Route files under src/app/**, auth components, and landing pages must import leaf subpaths from @asc/ui (e.g. @asc/ui/components/ui/*, @asc/ui/components/theme/*, @asc/ui/lib/utils) to prevent barrel bundle inflation (LM-011).",
  },
];

/**
 * Boundary rules for deployable apps (apps/web, apps/api, apps/worker).
 * Apps compose packages; they never own shared types, schemas, clients or
 * third-party libraries that a package already wraps. See
 * docs/plan/implementation-plan.md §4 and LEARNING_MISTAKES.md LM-001.
 *
 * @param {{ browser?: boolean }} [options] browser: also require leaf subpath imports
 * @returns {import("eslint").Linter.Config[]}
 */
export function appBoundaryConfig({ browser = false } = {}) {
  const baseRestricted = browser
    ? [...APP_RESTRICTED_PATHS, ...BROWSER_ENTRY_POINT_PATHS]
    : APP_RESTRICTED_PATHS;

  const patterns = [
    {
      group: ["@radix-ui/*"],
      message: "Base UI only, through @asc/ui.",
    },
    { group: ["@mantine/*"], message: "One design system: @asc/ui." },
    {
      group: ["@ai-sdk/*", "@anthropic-ai/*", "openai"],
      message: "LLM calls only in @asc/agents.",
    },
  ];

  return [
    {
      files: ["src/**/*.ts", "src/**/*.tsx"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: baseRestricted,
            patterns,
          },
        ],
        "no-restricted-syntax": [
          "error",
          {
            selector: "ExportNamedDeclaration > TSInterfaceDeclaration",
            message:
              "Shared types belong in @asc/types (LM-001). Component props interfaces stay unexported.",
          },
          {
            selector: "ExportNamedDeclaration > TSTypeAliasDeclaration",
            message: "Shared types belong in @asc/types (LM-001).",
          },
          {
            selector: "CallExpression[callee.object.name='z']",
            message: "Zod schemas belong in @asc/validation (LM-001).",
          },
        ],
      },
    },
    {
      files: [
        "src/app/**/*.ts*",
        "src/components/auth/**/*.ts*",
        "src/features/landing/**/*.ts*",
      ],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [...baseRestricted, ...ROUTE_RESTRICTED_PATHS],
            patterns,
          },
        ],
      },
    },
  ];
}

/** Boundary rules for Node apps (apps/api, apps/worker). */
export const appBoundaries = appBoundaryConfig();

/** Config for Node apps (apps/api, apps/worker). */
export const config = [...baseConfig, ...appBoundaries];
