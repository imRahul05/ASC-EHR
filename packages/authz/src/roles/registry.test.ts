import type { Capability, RoleTemplate } from "@asc/types";
import { describe, expect, it } from "vitest";
import { createRoleRegistry } from "./registry";

function template(key: string, overrides: Partial<RoleTemplate> = {}): RoleTemplate {
  return {
    key,
    version: 1,
    label: key,
    status: "active",
    capabilities: ["case.read"],
    data: [],
    facilityScoped: true,
    requiresMfa: true,
    ...overrides,
  };
}

describe("createRoleRegistry", () => {
  it("looks templates up by key and lists them in order", () => {
    const registry = createRoleRegistry([template("rn"), template("tech")]);
    expect(registry.get("rn")?.key).toBe("rn");
    expect(registry.get("missing")).toBeUndefined();
    expect(registry.all().map((t) => t.key)).toEqual(["rn", "tech"]);
  });

  it("does not resolve Object.prototype names as roles", () => {
    expect(createRoleRegistry([template("rn")]).get("toString")).toBeUndefined();
  });

  it("rejects duplicate keys", () => {
    expect(() => createRoleRegistry([template("rn"), template("rn")])).toThrow("Duplicate");
  });

  it("rejects invalid versions and empty keys", () => {
    expect(() => createRoleRegistry([template("rn", { version: 0 })])).toThrow("version");
    expect(() => createRoleRegistry([template("")])).toThrow("empty key");
  });

  it("rejects capabilities outside the catalog", () => {
    const bad = template("rn", { capabilities: ["note.delete" as Capability] });
    expect(() => createRoleRegistry([bad])).toThrow("unknown capability");
  });
});
