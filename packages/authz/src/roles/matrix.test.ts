import { CAPABILITY_CATALOG } from "@asc/types/capability";
import type { Capability } from "@asc/types";
import { describe, expect, it } from "vitest";
import { roleRegistry } from "./index";

const STAFF = ["front-desk", "rn", "tech", "gi-physician", "anesthesia", "coder", "admin", "auditor"];
const CLINICAL = ["rn", "gi-physician", "anesthesia"];

// Rows of 08 s7.3, written out so a widening shows up as a reviewed diff.
const DOCUMENTED: readonly (readonly [Capability, readonly string[]])[] = [
  ["patient.read", STAFF],
  ["patient.register", ["front-desk", "admin"]],
  ["patient.merge", ["admin"]],
  ["patient.eligibility.check", ["front-desk", "admin"]],
  ["schedule.read", ["front-desk", "rn", "tech", "gi-physician", "anesthesia", "admin"]],
  ["schedule.manage", ["front-desk", "admin"]],
  ["whiteboard.read", ["front-desk", "rn", "tech", "gi-physician", "anesthesia", "admin"]],
  ["case.read", STAFF],
  ["case.advance", ["front-desk", "rn", "gi-physician", "anesthesia"]],
  ["case.cancel", ["front-desk", "gi-physician", "admin"]],
  ["hp.document", CLINICAL],
  ["medhold.review", CLINICAL],
  ["consent.collect", ["front-desk", ...CLINICAL]],
  ["consent.witness", CLINICAL],
  ["timeout.participate", ["rn", "tech", "gi-physician", "anesthesia"]],
  ["procedure.document", ["rn", "tech", "gi-physician"]],
  ["specimen.manage", ["rn", "tech", "gi-physician"]],
  ["image.manage", ["rn", "tech", "gi-physician"]],
  ["anesthesia.document", ["anesthesia"]],
  ["note.draft", ["gi-physician"]],
  ["note.edit", ["gi-physician", "anesthesia"]],
  ["note.sign", ["gi-physician", "anesthesia"]],
  ["note.addend", ["gi-physician", "anesthesia"]],
  ["pacu.document", ["rn", "anesthesia"]],
  ["discharge.approve", CLINICAL],
  ["coding.review", ["gi-physician", "coder"]],
  ["coding.attest", ["coder"]],
  ["charge.export", ["coder"]],
  ["pathology.reconcile", ["rn", "gi-physician"]],
  ["pathology.letter.send", ["rn", "gi-physician"]],
  ["referral.triage", ["rn", "gi-physician"]],
  ["fax.send", ["front-desk", "rn"]],
  ["ai.generate", [...CLINICAL, "coder"]],
  ["admin.users", ["admin"]],
  ["admin.roles", ["admin"]],
  ["admin.facility", ["admin"]],
  ["audit.read", ["admin", "auditor"]],
  ["breakglass.invoke", CLINICAL],
  ["portal.self.read", ["patient"]],
  ["portal.self.forms", ["patient"]],
];

const rolesWith = (capability: Capability) =>
  roleRegistry
    .all()
    .filter((template) => template.capabilities.includes(capability))
    .map((template) => template.key);

describe("role x capability matrix", () => {
  it.each(DOCUMENTED)("%s is granted exactly as documented", (capability, expected) => {
    expect([...rolesWith(capability)].sort()).toEqual([...expected].sort());
  });

  it("documents every capability in the catalog", () => {
    expect(DOCUMENTED.map(([capability]) => capability).sort()).toEqual(
      CAPABILITY_CATALOG.map((entry) => entry.key).sort(),
    );
  });

  it("grants every capability to at least one role (no orphans)", () => {
    for (const { key } of CAPABILITY_CATALOG) expect(rolesWith(key), key).not.toHaveLength(0);
  });

  it("pins the full matrix", () => {
    const roles = roleRegistry.all();
    const header = ["capability", ...roles.map((role) => role.key)].join(" | ");
    const rows = CAPABILITY_CATALOG.map(({ key }) =>
      [key, ...roles.map((role) => (role.capabilities.includes(key) ? "Y" : "-"))].join(" | "),
    );
    expect([header, ...rows].join("\n")).toMatchSnapshot();
  });
});
