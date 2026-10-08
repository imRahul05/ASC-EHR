import { readFileSync, writeFileSync } from "node:fs";
import { ROLE_TEMPLATES } from "@asc/authz";

import { loadSeedEnv, signInToProject } from "./lib/medplum-session.js";
import {
  PROJECT_NAME,
  parseClientAppDefinitions,
  seedClientApplications,
  seedFacility,
  seedPractitioners,
  staffRoleKeys,
} from "./lib/seed.js";

/**
 * `pnpm medplum:seed`: seeds the LOCAL Medplum from docker compose with synthetic data:
 * the project, one facility, one practitioner per role and the client applications.
 * Safe to run again (every create is conditional). The environment is parsed first, so
 * a Medplum URL that is not loopback is refused before anything else runs.
 *
 * Medplum throttles logins (5 per window), so the script logs in once, plus once more
 * on the very first run after it has created the project.
 */
const say = (line: string) => process.stdout.write(`${line}\n`);

const { client, projectId, created } = await signInToProject(loadSeedEnv());
say(`project ${PROJECT_NAME}: ${projectId} (${created ? "created" : "already there"})`);

const facilityId = await seedFacility(client);
say(`facility: ${facilityId}`);

const practitioners = await seedPractitioners(client, staffRoleKeys(ROLE_TEMPLATES));
say(`practitioners: ${Object.keys(practitioners).length} (one per staff role)`);

const definitions = parseClientAppDefinitions(
  JSON.parse(readFileSync(new URL("../../../infra/medplum/client-apps.json", import.meta.url), "utf8")),
);
const clientApplications = await seedClientApplications(client, projectId, definitions);
for (const [key, app] of Object.entries(clientApplications)) say(`client application ${key}: ${app.id}`);

// Ids and the generated secrets for local use. Git-ignored; never printed.
const outputPath = new URL("../.seed-output.json", import.meta.url);
writeFileSync(outputPath, `${JSON.stringify({ projectId, facilityId, practitioners, clientApplications }, null, 2)}\n`, { mode: 0o600 });
say("wrote apps/bots/.seed-output.json (client ids and secrets, git-ignored)");
