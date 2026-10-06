/**
 * Files that still compare role names (asc/no-role-name-comparison is off for
 * them). Paths are relative to the package that lints them (apps/web).
 * The list may only shrink: P05d removes every entry, and no new file is
 * added. @asc/authz turns the rule off in its own config.
 *
 * @type {string[]}
 */
export const ROLE_CHECK_BASELINE = [
  "src/components/shell/app-sidebar.tsx",
  "src/features/dashboard/role-dashboard.tsx",
  "src/features/guide/guide-personas.tsx",
  "src/features/guide/use-tour.ts",
  "src/hooks/use-auth.ts",
  "src/mocks/db/store.ts",
  "src/mocks/handlers/clinical/center.ts",
];
