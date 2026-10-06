import { describe, expect, it } from "vitest";
import { buildGrants } from "./grants";
import { staffPrincipal } from "./fixtures";
import { roleRegistry } from "./roles/index";
import { defaultWorkspace, resolveWorkspaces, type WorkspaceDefinition } from "./workspaces";

// Test-only definitions: real ones live in apps/web.
const DEFINITIONS: readonly (WorkspaceDefinition & { home: string })[] = [
  { key: "physician", label: "Physician", requiresAny: ["note.sign"], home: "/worklist" },
  { key: "nursing", label: "Nursing", requiresAny: ["hp.document", "pacu.document"], home: "/dashboard" },
  { key: "front-desk", label: "Front desk", requiresAny: ["schedule.manage"], home: "/schedule" },
  { key: "audit", label: "Audit", requiresAny: ["audit.read"], home: "/audit" },
];

const userX = staffPrincipal(
  buildGrants(
    [
      { roleKey: "rn", facilityId: "A" },
      { roleKey: "gi-physician", facilityId: "B" },
    ],
    roleRegistry,
  ),
);

describe("resolveWorkspaces", () => {
  it("returns the workspaces the principal can use at the facility, keeping extra fields", () => {
    expect(resolveWorkspaces(userX, DEFINITIONS, { facilityId: "A" }).map((w) => w.key)).toEqual(["nursing"]);
    expect(resolveWorkspaces(userX, DEFINITIONS, { facilityId: "B" }).map((w) => w.key)).toEqual([
      "physician",
      "nursing",
    ]);
    expect(resolveWorkspaces(userX, DEFINITIONS, { facilityId: "B" })[0]?.home).toBe("/worklist");
  });

  it("fails closed without a facility for facility-scoped roles", () => {
    expect(resolveWorkspaces(userX, DEFINITIONS)).toEqual([]);
  });

  it("picks the first matching definition as the default", () => {
    expect(defaultWorkspace(userX, DEFINITIONS, { facilityId: "B" })?.key).toBe("physician");
    expect(defaultWorkspace(userX, DEFINITIONS, { facilityId: "C" })).toBeUndefined();
  });

  it("shows all-site workspaces at any facility and hides ones with no requirement", () => {
    const auditor = staffPrincipal(buildGrants([{ roleKey: "auditor" }], roleRegistry));
    const withEmpty = [...DEFINITIONS, { key: "none", label: "None", requiresAny: [] }];
    expect(resolveWorkspaces(auditor, withEmpty, { facilityId: "Z" }).map((w) => w.key)).toEqual(["audit"]);
  });
});
