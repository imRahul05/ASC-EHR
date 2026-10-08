import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { findHardeningViolations, REQUIRED_HARDENING } from "./hardening.js";

const INFRA_MEDPLUM = new URL("../../../../infra/medplum/", import.meta.url);

/** Every Medplum server config under infra/medplum (templates now, per-environment files later). */
const configFiles = readdirSync(INFRA_MEDPLUM).filter((name) => /^medplum\.config.*\.json$/.test(name));

describe("Medplum hardening", () => {
  it("finds the config files it is meant to guard", () => {
    expect(configFiles).toContain("medplum.config.template.json");
  });

  it.each(configFiles)("%s keeps registration off, audit events on and bot input unstored", (name) => {
    const config: unknown = JSON.parse(readFileSync(new URL(name, INFRA_MEDPLUM), "utf8"));
    expect(findHardeningViolations(config)).toEqual([]);
  });

  it("accepts a config with exactly the required values", () => {
    expect(findHardeningViolations({ ...REQUIRED_HARDENING, port: 8103 })).toEqual([]);
  });

  it.each(Object.entries(REQUIRED_HARDENING))("rejects %s when missing or flipped", (key, expected) => {
    const rest = Object.fromEntries(Object.entries(REQUIRED_HARDENING).filter(([other]) => other !== key));
    expect(findHardeningViolations(rest)).toEqual([`${key} must be explicitly ${String(expected)}`]);
    expect(findHardeningViolations({ ...REQUIRED_HARDENING, [key]: !expected })).toHaveLength(1);
  });

  it("rejects truthy look-alikes instead of coercing them", () => {
    expect(findHardeningViolations({ ...REQUIRED_HARDENING, registerEnabled: "false" })).toHaveLength(1);
    expect(findHardeningViolations({ ...REQUIRED_HARDENING, saveAuditEvents: 1 })).toHaveLength(1);
  });

  it("rejects anything that is not an object", () => {
    for (const bad of [null, undefined, "text", 3, []]) {
      expect(findHardeningViolations(bad)).toEqual(["config is not a JSON object"]);
    }
  });

  it("does not leak the offending value", () => {
    const message = findHardeningViolations({ ...REQUIRED_HARDENING, registerEnabled: "secret-looking" }).join();
    expect(message).not.toContain("secret-looking");
  });
});
