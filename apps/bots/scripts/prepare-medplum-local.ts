import { prepareLocalMedplum } from "./lib/local-credentials.js";

/**
 * `pnpm medplum:up` runs this first: generates the local Medplum credentials once and renders
 * the config and compose env file into the git-ignored `infra/medplum/.local/`. Prints no secret.
 */
const { generated } = prepareLocalMedplum(new URL("../../../infra/medplum/", import.meta.url));
process.stdout.write(
  generated
    ? "medplum: generated new local credentials in infra/medplum/.local (git-ignored)\n"
    : "medplum: using the existing local credentials in infra/medplum/.local\n",
);
