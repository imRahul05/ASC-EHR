import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ROLE_TEMPLATES } from "@asc/authz";

import { loadSeedEnv, signInToProject } from "./lib/medplum-session.js";
import { mergeDemoUsers, parseServicePolicies, seedDemoUsers, seedRolePolicies, seedServicePolicies } from "./lib/seed-access.js";
import {
  PROJECT_NAME,
  parseClientAppDefinitions,
  SECOND_FACILITY_KEY,
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
const secondFacilityId = await seedFacility(client, SECOND_FACILITY_KEY, "Demo Surgery Center 2 (synthetic)");
say(`facilities: ${facilityId}, ${secondFacilityId}`);

const practitioners = await seedPractitioners(client, staffRoleKeys(ROLE_TEMPLATES));
say(`practitioners: ${Object.keys(practitioners).length} (one per staff role)`);

const staffTemplates = ROLE_TEMPLATES.filter((template) => staffRoleKeys(ROLE_TEMPLATES).includes(template.key));
const policies = await seedRolePolicies(client, staffTemplates);
say(`access policies: ${Object.keys(policies).length} (one per staff role template)`);

const outputPath = new URL("../.seed-output.json", import.meta.url);
const previousOutput: unknown = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, "utf8")) : undefined;
const newUsers = await seedDemoUsers(client, staffTemplates, { projectId, facilityId, policies, practitioners });
const users = mergeDemoUsers(previousOutput, newUsers);
say(`demo users: ${Object.keys(users).length} (${Object.values(newUsers).filter((user) => user.password !== undefined).length} new)`);

const definitions = parseClientAppDefinitions(
  JSON.parse(readFileSync(new URL("../../../infra/medplum/client-apps.json", import.meta.url), "utf8")),
);
const servicePolicies = parseServicePolicies(JSON.parse(readFileSync(new URL("../../../infra/medplum/service-policies.json", import.meta.url), "utf8")));
const servicePolicyIds = await seedServicePolicies(client, servicePolicies);
say(`service policies: ${Object.keys(servicePolicyIds).join(", ")}`);
const clientApplications = await seedClientApplications(client, projectId, definitions, servicePolicyIds);
for (const [key, app] of Object.entries(clientApplications)) say(`client application ${key}: ${app.id}`);

// Ids and the generated secrets and demo passwords for local use. Git-ignored; never printed.
writeFileSync(
  outputPath,
  `${JSON.stringify({ projectId, facilityId, secondFacilityId, practitioners, policies, users, clientApplications }, null, 2)}\n`,
  { mode: 0o600 },
);
say("wrote apps/bots/.seed-output.json (client ids and secrets, git-ignored)");
