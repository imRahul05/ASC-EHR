import { describe, expect, it } from "vitest";
import { can } from "./can";
import { allGrant, facilityGrant, patientPrincipal, staffPrincipal } from "./fixtures";

describe("can", () => {
  it("does not leak a supervisor role held at facility B into facility A", () => {
    const userX = staffPrincipal([
      facilityGrant("A", ["rn"], ["case.read", "case.advance"]),
      facilityGrant("B", ["rn", "clinical-supervisor"], ["case.read", "case.advance", "case.cancel"]),
    ]);
    expect(can(userX, "case.cancel", { facilityId: "A" })).toBe(false);
    expect(can(userX, "case.cancel", { facilityId: "B" })).toBe(true);
    expect(can(userX, "case.advance", { facilityId: "A" })).toBe(true);
  });

  it("fails closed without a facilityId: only all-site grants count", () => {
    const user = staffPrincipal([
      facilityGrant("A", ["rn"], ["case.read"]),
      allGrant(["coder"], ["coding.review"]),
    ]);
    expect(can(user, "case.read")).toBe(false);
    expect(can(user, "coding.review")).toBe(true);
  });

  it("all-site grants apply at any facility", () => {
    const user = staffPrincipal([allGrant(["auditor"], ["audit.read"])]);
    expect(can(user, "audit.read", { facilityId: "Z" })).toBe(true);
  });

  it("denies a facility the principal has no grant at", () => {
    const user = staffPrincipal([facilityGrant("A", ["rn"], ["case.read"])]);
    expect(can(user, "case.read", { facilityId: "B" })).toBe(false);
  });

  it("denies capabilities the grant does not list", () => {
    const user = staffPrincipal([facilityGrant("A", ["rn"], ["case.read"])]);
    expect(can(user, "note.sign", { facilityId: "A" })).toBe(false);
  });

  it("never gives a patient principal staff capabilities, even from a forged grant", () => {
    const patient = patientPrincipal([
      allGrant(["patient"], ["portal.self.read", "note.sign", "patient.read"]),
    ]);
    expect(can(patient, "portal.self.read", { patientId: "patient-1" })).toBe(true);
    expect(can(patient, "note.sign")).toBe(false);
    expect(can(patient, "patient.read")).toBe(false);
  });

  it("limits a patient to their own record", () => {
    const patient = patientPrincipal([allGrant(["patient"], ["portal.self.read"])]);
    expect(can(patient, "portal.self.read", { patientId: "patient-2" })).toBe(false);
  });
});
