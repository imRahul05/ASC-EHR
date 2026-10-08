import type { TestProject } from "vitest/node";

import { loadSeedEnv, signInToProject } from "../scripts/lib/medplum-session.js";
import { THROTTLED } from "./harness.js";

export type LiveMedplum = { baseUrl: string; projectId: string; adminToken: string };

declare module "vitest" {
  interface ProvidedContext {
    medplum: LiveMedplum;
  }
}

/** Signs in once as the project super admin and hands the token to every live test file. */
export default async function setup(project: TestProject) {
  const env = loadSeedEnv();
  const reachable = await fetch(`${env.MEDPLUM_BASE_URL}healthcheck`).then((response) => response.ok, () => false);
  if (!reachable) throw new Error(`Medplum is not reachable at ${env.MEDPLUM_BASE_URL}. Run \`pnpm medplum:up && pnpm medplum:seed\`.`);
  const { client, projectId } = await signInToProject(env).catch((error: unknown) => {
    // Medplum answers a throttled login with an OperationOutcome, which the client throws as is.
    if (JSON.stringify(error).includes("throttled")) throw new Error(THROTTLED);
    throw error;
  });
  const adminToken = client.getAccessToken();
  if (adminToken === undefined) throw new Error("Medplum returned no access token");
  project.provide("medplum", { baseUrl: env.MEDPLUM_BASE_URL, projectId, adminToken });
}
