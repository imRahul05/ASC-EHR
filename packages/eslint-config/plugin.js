import maxHooksPerComponent from "./rules/max-hooks-per-component.js";
import noRoleNameComparison from "./rules/no-role-name-comparison.js";

/** Repo-specific ESLint rules (registered as the `asc` plugin). */
export const ascPlugin = {
  meta: { name: "@asc/eslint-plugin" },
  rules: {
    "max-hooks-per-component": maxHooksPerComponent,
    "no-role-name-comparison": noRoleNameComparison,
  },
};

/** React hygiene rules shared by the Next.js and React library configs. */
export const reactHygiene = {
  plugins: { asc: ascPlugin },
  rules: {
    "asc/max-hooks-per-component": "error",
  },
};
