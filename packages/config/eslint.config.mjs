import { config } from "@asc/eslint-config/base";

export default [
  ...config,
  {
    // @asc/config is the one package allowed to read process.env.
    files: ["src/**/*.ts"],
    rules: { "no-restricted-properties": "off" },
  },
];
