import { BROWSER_ENTRY_POINT_PATHS } from "@asc/eslint-config/app";
import { config } from "@asc/eslint-config/base";

export default [
  ...config,
  {
    // Bundled into apps/web: import leaf subpaths of Node-style packages.
    files: ["src/**/*.ts"],
    rules: { "no-restricted-imports": ["error", { paths: BROWSER_ENTRY_POINT_PATHS }] },
  },
];
