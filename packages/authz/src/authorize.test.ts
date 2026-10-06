import { describe, expect, it } from "vitest";
import { authorize } from "./can";
import { allGrant, facilityGrant, patientPrincipal, staffPrincipal } from "./fixtures";

const user = staffPrincipal([
  facilityGrant("A", ["rn"], ["case.read"]),
  facilityGrant("B", ["rn", "clinical-supervisor"], ["case.read", "case.cancel"]),
  allGrant(["auditor"], ["audit.read"]),
]);

describe("authorize", () => {
  it("allows with the role keys of the grants that matched (decision provenance)", () => {
    expect(authorize(user, "case.cancel", { facilityId: "B" })).toEqual({
      allowed: true,
      roleKeys: ["rn", "clinical-supervisor"],
    });
  });

  it("denies at gate 3 when the principal has no grant at the facility", () => {
    const facilityOnly = staffPrincipal([facilityGrant("A", ["rn"], ["case.read"])]);
    expect(authorize(facilityOnly, "case.read", { facilityId: "C" })).toEqual({
      allowed: false,
      gate: 3,
      reason: "no-grant-at-facility",
    });
  });

  it("an all-site grant counts as a grant at every facility, so the capability decides (gate 4)", () => {
    expect(authorize(user, "case.read", { facilityId: "C" })).toMatchObject({ allowed: false, gate: 4 });
    expect(authorize(user, "audit.read", { facilityId: "C" })).toMatchObject({ allowed: true });
  });

  it("denies at gate 3 when no facility is named and no all-site grant exists", () => {
    const facilityOnly = staffPrincipal([facilityGrant("A", ["rn"], ["case.read"])]);
    expect(authorize(facilityOnly, "case.read")).toMatchObject({ allowed: false, gate: 3 });
  });

  it("denies at gate 4 when the facility grant lacks the capability", () => {
    expect(authorize(user, "case.cancel", { facilityId: "A" })).toEqual({
      allowed: false,
      gate: 4,
      reason: "capability-not-granted",
    });
  });

  it("denies a patient staff capability at gate 4", () => {
    const patient = patientPrincipal([allGrant(["patient"], ["note.sign"])]);
    expect(authorize(patient, "note.sign")).toEqual({
      allowed: false,
      gate: 4,
      reason: "patient-capability-not-portal",
    });
  });
});
