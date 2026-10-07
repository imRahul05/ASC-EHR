/**
 * Credentials of the LOCAL Medplum stack are generated per machine, never committed:
 * a committed password (even a dev-only one) is a secret scanner finding and the same
 * known value on every developer's machine. They live in the git-ignored
 * `infra/medplum/.local/`, next to the config rendered from the committed template.
 */

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

export const PLACEHOLDERS = {
  databasePassword: "__MEDPLUM_DATABASE_PASSWORD__",
  redisPassword: "__MEDPLUM_REDIS_PASSWORD__",
  superAdminPassword: "__MEDPLUM_SUPER_ADMIN_PASSWORD__",
} as const;

type Credentials = { [Key in keyof typeof PLACEHOLDERS]: string };

/** Hex passwords: safe in JSON, in a compose env file and in a URL. */
export const randomPassword = () => randomBytes(18).toString("hex");

export function generateCredentials(random: () => string = randomPassword): Credentials {
  return { databasePassword: random(), redisPassword: random(), superAdminPassword: random() };
}

/** Reads credentials back from `credentials.json`. Returns undefined unless every field is a non-empty string. */
export function parseCredentials(json: unknown): Credentials | undefined {
  if (typeof json !== "object" || json === null) return undefined;
  const record = json as Record<string, unknown>;
  const fields = Object.keys(PLACEHOLDERS) as (keyof Credentials)[];
  const values = fields.map((field) => record[field]);
  if (!values.every((value) => typeof value === "string" && value.length > 0)) return undefined;
  return Object.fromEntries(fields.map((field, index) => [field, values[index]])) as Credentials;
}

/** Fills the committed config template. Every placeholder must be present and none may survive. */
export function renderConfig(template: string, credentials: Credentials): string {
  let rendered = template;
  for (const [field, placeholder] of Object.entries(PLACEHOLDERS)) {
    if (!template.includes(placeholder)) throw new Error(`Config template has no ${placeholder}`);
    rendered = rendered.replaceAll(placeholder, credentials[field as keyof Credentials]);
  }
  if (/__MEDPLUM_[A-Z_]+__/.test(rendered)) throw new Error("Config template has an unknown placeholder");
  return rendered;
}

/** The variables `docker-compose.yml` reads for the Medplum Postgres and Redis containers. */
export function renderComposeEnv(credentials: Credentials): string {
  return `MEDPLUM_DB_PASSWORD=${credentials.databasePassword}\nMEDPLUM_REDIS_PASSWORD=${credentials.redisPassword}\n`;
}

const LOCAL_DIR = ".local/";

/** The generated credentials, or undefined when none were generated yet. Throws if the file is damaged. */
export function loadCredentials(infraDir: URL): Credentials | undefined {
  const file = new URL(`${LOCAL_DIR}credentials.json`, infraDir);
  if (!existsSync(file)) return undefined;
  // Regenerating would no longer match the passwords already stored in the Postgres volume, so any
  // unreadable file (empty, truncated, not JSON, a directory, wrong shape) gets the same instructions.
  const damaged = new Error(
    "infra/medplum/.local/credentials.json is damaged: reset the local Medplum (see the runbook) and run pnpm medplum:up again",
  );
  let credentials: Credentials | undefined;
  try {
    credentials = parseCredentials(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    // The parser's own message can quote file content: do not keep it.
    throw damaged;
  }
  if (credentials === undefined) throw damaged;
  return credentials;
}

/**
 * Generates the credentials once (a second run keeps them: the database volume already holds
 * them), then renders the Medplum config and the compose env file from the committed template.
 * Everything is written to the git-ignored `.local/`, readable by the owner only.
 */
export function prepareLocalMedplum(infraDir: URL, random: () => string = randomPassword): { generated: boolean } {
  const existing = loadCredentials(infraDir);
  const credentials = existing ?? generateCredentials(random);
  const dir = new URL(LOCAL_DIR, infraDir);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const write = (name: string, content: string) => {
    const target = new URL(name, dir);
    // Docker creates a directory at a bind-mount path whose file is missing (older compose files did this).
    if (existsSync(target) && statSync(target).isDirectory()) {
      throw new Error(`infra/medplum/.local/${name} is a directory: remove it and run pnpm medplum:up again`);
    }
    writeFileSync(target, content, { mode: 0o600 });
  };
  if (existing === undefined) write("credentials.json", `${JSON.stringify(credentials, null, 2)}\n`);
  write("medplum.config.json", renderConfig(readFileSync(new URL("medplum.config.template.json", infraDir), "utf8"), credentials));
  write("compose.env", renderComposeEnv(credentials));
  return { generated: existing === undefined };
}
