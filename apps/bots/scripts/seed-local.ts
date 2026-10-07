import { parseEnv, seedEnvSchema } from "@asc/config";

/**
 * `pnpm medplum:seed`: seeds the LOCAL Medplum from docker compose with synthetic
 * data. The environment is parsed first: a Medplum URL that is not loopback is
 * refused before anything else runs. The seeding itself is added in the next commits.
 */
const env = parseEnv(seedEnvSchema);
process.stdout.write(`seed: target ${env.MEDPLUM_BASE_URL} (local only), nothing to seed yet\n`);
