import { randomBytes } from "node:crypto";
import { EnvValidationError, getProcessEnv, parseEnv, seedEnvSchema } from "@asc/config";
import { ClientStorage, MedplumClient, MemoryStorage } from "@medplum/core";

import { loadCredentials } from "./local-credentials.js";
import { ensureProject, PROJECT_NAME, stringField } from "./seed.js";

export type SeedEnv = ReturnType<typeof seedEnvSchema.parse>;

const INFRA = new URL("../../../../infra/medplum/", import.meta.url);

/**
 * The seed environment. The super admin password is generated per machine by `pnpm medplum:up`;
 * the environment wins. A Medplum URL that is not loopback is refused here, before anything else.
 */
export function loadSeedEnv(): SeedEnv {
  const generated = loadCredentials(INFRA);
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
}

// An in-memory store: Node's experimental global localStorage has no usable API without a flag.
export function newSession(env: SeedEnv) {
  const storage = new ClientStorage(new MemoryStorage());
  return { client: new MedplumClient({ baseUrl: env.MEDPLUM_BASE_URL, storage }), storage };
}
type Session = ReturnType<typeof newSession>;

const idOf = (reference: string | undefined) => reference?.split("/")[1];

/**
 * Password login with a plain PKCE challenge we supply ourselves. The client otherwise tries
 * to hash the verifier with a browser API, fails under Node, falls back to plain and prints a
 * stack trace. Plain is acceptable here: only ever used against a loopback Medplum.
 */
export async function startLogin(
  session: Session,
  credentials: { email: string; password: string },
  extra: { projectId?: string } = {},
) {
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

/**
 * Signs in as the super admin to the seeded project, creating the project on the very first run.
 * Logs in once (twice on the first run, after the project exists).
 */
export async function signInToProject(env: SeedEnv): Promise<{ client: MedplumClient; projectId: string; created: boolean }> {
  const credentials = { email: env.MEDPLUM_SUPER_ADMIN_EMAIL, password: env.MEDPLUM_SUPER_ADMIN_PASSWORD };
  const rootSession = newSession(env);
  const { client } = rootSession;
  const { response: first, finish } = await startLogin(rootSession, credentials);
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
  const projectSession = newSession(env);
  const { response: second, finish: finishProject } = await startLogin(projectSession, credentials, { projectId: project.id });
  if (second.code === undefined) throw new Error("Could not sign in to the new project");
  await finishProject(second.code);
  return { client: projectSession.client, projectId: project.id, created: project.created };
}
