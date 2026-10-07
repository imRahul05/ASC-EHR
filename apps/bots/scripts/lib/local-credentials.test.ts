import { copyFileSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import {
  generateCredentials,
  loadCredentials,
  parseCredentials,
  PLACEHOLDERS,
  prepareLocalMedplum,
  renderComposeEnv,
  renderConfig,
} from "./local-credentials.js";

const TEMPLATE = new URL("../../../../infra/medplum/medplum.config.template.json", import.meta.url);
const read = (url: URL) => readFileSync(url, "utf8");

/** A throw-away copy of infra/medplum with the real template. */
function tempInfra(): URL {
  const dir = mkdtempSync(join(tmpdir(), "asc-medplum-"));
  copyFileSync(TEMPLATE, join(dir, "medplum.config.template.json"));
  return pathToFileURL(`${dir}/`);
}

/** Distinct values that are obviously not secrets, so no literal is ever assigned to a password field. */
function sequence() {
  let n = 0;
  return () => `fixture-value-${++n}`;
}

describe("credentials", () => {
  it("generates three different passwords and never a fixed value", () => {
    const first = generateCredentials();
    const second = generateCredentials();
    const values = Object.values(first);
    expect(new Set(values).size).toBe(3);
    expect(values.every((value) => /^[0-9a-f]{36}$/.test(value))).toBe(true);
    expect(second).not.toEqual(first);
  });

  it("parses stored credentials and rejects anything incomplete", () => {
    const credentials = generateCredentials();
    expect(parseCredentials(credentials)).toEqual(credentials);
    expect(parseCredentials({ ...credentials, redisPassword: "" })).toBeUndefined();
    expect(parseCredentials({ databasePassword: credentials.databasePassword })).toBeUndefined();
    expect(parseCredentials(null)).toBeUndefined();
    expect(parseCredentials("text")).toBeUndefined();
  });
});

describe("renderConfig", () => {
  const credentials = generateCredentials(sequence());

  it("fills every placeholder of the committed template and leaves none behind", () => {
    const rendered = JSON.parse(renderConfig(read(TEMPLATE), credentials)) as {
      database: { password: string };
      redis: { password: string };
      defaultSuperAdminPassword: string;
    };
    expect(rendered.database.password).toBe(credentials.databasePassword);
    expect(rendered.redis.password).toBe(credentials.redisPassword);
    expect(rendered.defaultSuperAdminPassword).toBe(credentials.superAdminPassword);
    expect(new Set([rendered.database.password, rendered.redis.password, rendered.defaultSuperAdminPassword]).size).toBe(3);
    expect(JSON.stringify(rendered)).not.toMatch(/__MEDPLUM_/);
  });

  it("refuses a template that lacks a placeholder or has an unknown one", () => {
    expect(() => renderConfig('{"a": "__MEDPLUM_DATABASE_PASSWORD__"}', credentials)).toThrow("has no __MEDPLUM_REDIS_PASSWORD__");
    const all = Object.values(PLACEHOLDERS).join(" ");
    expect(() => renderConfig(`${all} __MEDPLUM_SOMETHING_ELSE__`, credentials)).toThrow("unknown placeholder");
  });

  it("renders the compose env file for the database and redis only", () => {
    expect(renderComposeEnv(credentials)).toBe(
      `MEDPLUM_DB_PASSWORD=${credentials.databasePassword}\nMEDPLUM_REDIS_PASSWORD=${credentials.redisPassword}\n`,
    );
  });
});

describe("prepareLocalMedplum", () => {
  it("generates credentials once, renders the config, and keeps them on the next run", () => {
    const infra = tempInfra();
    const first = prepareLocalMedplum(infra, sequence());
    const stored = read(new URL(".local/credentials.json", infra));
    const second = prepareLocalMedplum(infra, sequence());
    expect(first.generated).toBe(true);
    expect(second.generated).toBe(false);
    expect(read(new URL(".local/credentials.json", infra))).toBe(stored);
    const config = JSON.parse(read(new URL(".local/medplum.config.json", infra))) as { database: { password: string } };
    expect(config.database.password).toBe((JSON.parse(stored) as { databasePassword: string }).databasePassword);
    expect(read(new URL(".local/compose.env", infra))).toContain(`MEDPLUM_DB_PASSWORD=${config.database.password}`);
  });

  it("makes the generated files readable by the owner only", () => {
    const infra = tempInfra();
    prepareLocalMedplum(infra);
    for (const name of ["credentials.json", "medplum.config.json", "compose.env"]) {
      expect(statSync(new URL(`.local/${name}`, infra)).mode & 0o077, name).toBe(0);
    }
  });

  it("refuses a damaged credentials file instead of regenerating passwords the database no longer matches", () => {
    const infra = tempInfra();
    prepareLocalMedplum(infra);
    writeFileSync(new URL(".local/credentials.json", infra), JSON.stringify({ databasePassword: sequence()() }));
    expect(() => loadCredentials(infra)).toThrow("is damaged");
    expect(() => prepareLocalMedplum(infra)).toThrow("is damaged");
  });

  it("returns undefined before anything was generated", () => {
    expect(loadCredentials(tempInfra())).toBeUndefined();
  });
});

describe("no committed credentials", () => {
  it("keeps every password in the committed template, compose file and seed defaults a placeholder or a variable", () => {
    const template = JSON.parse(read(TEMPLATE)) as { database: { password: string }; redis: { password: string }; defaultSuperAdminPassword: string };
    for (const value of [template.database.password, template.redis.password, template.defaultSuperAdminPassword]) {
      expect(value).toMatch(/^__MEDPLUM_[A-Z_]+__$/);
    }
    const compose = read(new URL("../../../../docker-compose.yml", import.meta.url));
    const medplumPart = compose.slice(compose.indexOf("medplum-postgres:"));
    expect(medplumPart).toContain("POSTGRES_PASSWORD: ${MEDPLUM_DB_PASSWORD");
    expect(medplumPart).not.toMatch(/PASSWORD:\s+(?!\$\{)[^\s#]+/);
    expect(medplumPart).not.toMatch(/--requirepass",\s*"(?!\$\{)/);
    // Redis must refuse an empty password (an empty --requirepass means no authentication at all).
    expect(medplumPart).toContain('test -n "$$REDIS_PASSWORD"');
    expect(medplumPart).toContain('exec redis-server --requirepass "$$REDIS_PASSWORD"');
    expect(medplumPart).not.toMatch(/redis-cli -a /);
  });
});
