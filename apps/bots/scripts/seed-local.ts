import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { ROLE_TEMPLATES } from "@asc/authz";
import { EnvValidationError, getProcessEnv, parseEnv, seedEnvSchema } from "@asc/config";
import { ClientStorage, MedplumClient, MemoryStorage } from "@medplum/core";

import { loadCredentials } from "./lib/local-credentials.js";
import {
  ensureProject,
  PROJECT_NAME,
  seedFacility,
  seedPractitioners,
  staffRoleKeys,
  stringField,
} from "./lib/seed.js";

/**
 * `pnpm medplum:seed`: seeds the LOCAL Medplum from docker compose with synthetic data:
 * the project, one facility and one practitioner per role.
 * Safe to run again (every create is conditional). The environment is parsed first, so
 * a Medplum URL that is not loopback is refused before anything else runs.
 *
 * Medplum throttles logins (5 per window), so the script logs in once, plus once more
 * on the very first run after it has created the project.
 */
// The super admin password is generated per machine by `pnpm medplum:up`; the environment wins.
const generated = loadCredentials(new URL("../../../infra/medplum/", import.meta.url));
const env = (() => {
  try {
    return parseEnv(seedEnvSchema, {
      ...(generated === undefined ? {} : { MEDPLUM_SUPER_ADMIN_PASSWORD: generated.superAdminPassword }),
      ...getProcessEnv(),
    });
  } catch (error) {
    if (error instanceof EnvValidationError && error.variables.includes("MEDPLUM_SUPER_ADMIN_PASSWORD")) {
      process.stderr.write("seed: no super admin password. Run `pnpm medplum:up` first (it generates the local credentials).\n");
    }
    throw error;
  }
})();
const say = (line: string) => process.stdout.write(`${line}\n`);

// An in-memory store: Node's experimental global localStorage has no usable API without a flag.
function newSession() {
  const storage = new ClientStorage(new MemoryStorage());
  return { client: new MedplumClient({ baseUrl: env.MEDPLUM_BASE_URL, storage }), storage };
}
const credentials = { email: env.MEDPLUM_SUPER_ADMIN_EMAIL, password: env.MEDPLUM_SUPER_ADMIN_PASSWORD };
const idOf = (reference: string | undefined) => reference?.split("/")[1];

/**
 * Password login with a plain PKCE challenge we supply ourselves. The client otherwise tries
 * to hash the verifier with a browser API, fails under Node, falls back to plain and prints a
 * stack trace. Plain is acceptable here: the seed only ever talks to a loopback Medplum.
 */
async function startLogin(session: ReturnType<typeof newSession>, extra: { projectId?: string } = {}) {
  const verifier = randomBytes(32).toString("base64url");
  const response = await session.client.startLogin({ ...credentials, ...extra, codeChallenge: verifier, codeChallengeMethod: "plain" });
  // The client reads the verifier from its storage when the code is exchanged.
  session.storage.setString("codeVerifier", verifier);
  return { response, finish: (code: string) => session.client.processCode(code) };
}

/** Finishes a login that returned several memberships by choosing one. */
async function chooseMembership(
  client: MedplumClient,
  finish: (code: string) => Promise<unknown>,
  login: string,
  membershipId: string | undefined,
): Promise<void> {
  if (membershipId === undefined) throw new Error("Medplum returned a membership without an id");
  const chosen: unknown = await client.post("auth/profile", { login, profile: membershipId });
  const code = stringField(chosen, "code");
  if (code === undefined) throw new Error("Medplum returned no login code");
  await finish(code);
}

async function signInToProject(): Promise<{ client: MedplumClient; projectId: string; created: boolean }> {
  const { client, storage } = newSession();
  const { response: first, finish } = await startLogin({ client, storage });
  const loginId = first.login;
  if (loginId === undefined) throw new Error("Medplum returned no login id");
  const memberships = first.memberships ?? [];

  const inProject = memberships.find((membership) => membership.project.display === PROJECT_NAME);
  const existingId = idOf(inProject?.project.reference);
  if (inProject !== undefined && existingId !== undefined) {
    await chooseMembership(client, finish, loginId, inProject.id);
    return { client, projectId: existingId, created: false };
  }

  // First run: act as the super admin to create the project, then sign in to it.
  if (first.code !== undefined) {
    await finish(first.code);
  } else {
    const superAdmin = memberships.find((membership) => membership.project.display === "Super Admin");
    if (superAdmin === undefined) throw new Error("The configured user has no Super Admin membership");
    await chooseMembership(client, finish, loginId, superAdmin.id);
  }
  const project = await ensureProject(client);
  const projectSession = newSession();
  const projectClient = projectSession.client;
  const { response: second, finish: finishProject } = await startLogin(projectSession, { projectId: project.id });
  if (second.code === undefined) throw new Error("Could not sign in to the new project");
  await finishProject(second.code);
  return { client: projectClient, projectId: project.id, created: project.created };
}

const { client, projectId, created } = await signInToProject();
say(`project ${PROJECT_NAME}: ${projectId} (${created ? "created" : "already there"})`);

const facilityId = await seedFacility(client);
say(`facility: ${facilityId}`);

const practitioners = await seedPractitioners(client, staffRoleKeys(ROLE_TEMPLATES));
say(`practitioners: ${Object.keys(practitioners).length} (one per staff role)`);

// Ids for local use. Git-ignored.
const outputPath = new URL("../.seed-output.json", import.meta.url);
writeFileSync(outputPath, `${JSON.stringify({ projectId, facilityId, practitioners }, null, 2)}\n`, { mode: 0o600 });
say("wrote apps/bots/.seed-output.json (git-ignored)");
