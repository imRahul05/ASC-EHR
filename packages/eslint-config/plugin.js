import maxHooksPerComponent from "./rules/max-hooks-per-component.js";

/** Repo-specific ESLint rules (registered as the `asc` plugin). */
export const ascPlugin = {
  meta: { name: "@asc/eslint-plugin" },
  rules: {
    "max-hooks-per-component": maxHooksPerComponent,
  },
};

/** React hygiene rules shared by the Next.js and React library configs. */
export const reactHygiene = {
  plugins: { asc: ascPlugin },
  rules: {
    "asc/max-hooks-per-component": "error",
  },
};
