import { CAPABILITY_CATALOG } from "@asc/types/capability";
import type { Capability } from "@asc/types";
import { describe, expect, it } from "vitest";
import { roleRegistry } from "./index.js";

const STAFF = ["front-desk", "rn", "tech", "gi-physician", "anesthesia", "coder", "admin", "auditor"];

// Rows of 08 s7.3, written out so a widening shows up as a reviewed diff.
// Read capabilities the matrix implies (schedule.read, whiteboard.read, case.read)
// are covered by the snapshot below, not listed here.
const DOCUMENTED: readonly (readonly [Capability, readonly string[]])[] = [
  ["patient.read", STAFF],
  ["patient.register", ["front-desk", "admin"]],
  ["schedule.manage", ["front-desk", "admin"]],
  ["case.advance", ["front-desk", "rn", "gi-physician", "anesthesia"]],
  ["hp.document", ["rn", "gi-physician", "anesthesia"]],
  ["medhold.review", ["rn", "gi-physician", "anesthesia"]],
  ["consent.collect", ["front-desk", "rn", "gi-physician", "anesthesia"]],
  ["procedure.document", ["rn", "tech", "gi-physician"]],
  ["specimen.manage", ["rn", "tech", "gi-physician"]],
  ["anesthesia.document", ["anesthesia"]],
  ["note.draft", ["gi-physician"]],
  ["note.sign", ["gi-physician", "anesthesia"]],
  ["pacu.document", ["rn", "anesthesia"]],
  ["discharge.approve", ["rn", "gi-physician", "anesthesia"]],
  ["coding.review", ["gi-physician", "coder"]],
  ["coding.attest", ["coder"]],
  ["charge.export", ["coder"]],
  ["pathology.reconcile", ["rn", "gi-physician"]],
  ["admin.users", ["admin"]],
  ["admin.roles", ["admin"]],
  ["admin.facility", ["admin"]],
  ["audit.read", ["admin", "auditor"]],
  ["breakglass.invoke", ["rn", "gi-physician", "anesthesia"]],
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

  it("pins the full matrix", () => {
    const roles = roleRegistry.all();
    const header = ["capability", ...roles.map((role) => role.key)].join(" | ");
    const rows = CAPABILITY_CATALOG.map(({ key }) =>
      [key, ...roles.map((role) => (role.capabilities.includes(key) ? "Y" : "-"))].join(" | "),
    );
    expect([header, ...rows].join("\n")).toMatchSnapshot();
  });
});
