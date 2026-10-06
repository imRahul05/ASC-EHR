import { describe, expect, it } from "vitest";
import { meFor } from "../mocks/handlers/me";
import { checkCapability } from "./use-can";

function principalOf(email: string) {
  const me = meFor(email);
  if (me === undefined) throw new Error(`no demo user ${email}`);
  return me.principal;
}

describe("checkCapability", () => {
  const float = principalOf("float@ascehr.demo");

  it("checks the current facility: the same user can sign at Lakeside but not at Metro", () => {
    expect(checkCapability(float, "fac-metro", "note.sign")).toBe(false);
    expect(checkCapability(float, "fac-lakeside", "note.sign")).toBe(true);
    expect(checkCapability(float, "fac-metro", "hp.document")).toBe(true);
    expect(checkCapability(float, "fac-lakeside", "hp.document")).toBe(true);
  });

  it("fails closed with no facility for a facility-scoped user, and with no principal", () => {
    expect(checkCapability(float, null, "case.read")).toBe(false);
    expect(checkCapability(null, "fac-metro", "case.read")).toBe(false);
  });

  it("lets an all-site role act without a current facility", () => {
    expect(checkCapability(principalOf("admin@ascehr.demo"), null, "admin.users")).toBe(true);
  });

  it("treats several capabilities as any-of, and an empty list as no access", () => {
    expect(checkCapability(float, "fac-metro", ["note.sign", "hp.document"])).toBe(true);
    expect(checkCapability(float, "fac-metro", ["note.sign", "audit.read"])).toBe(false);
    expect(checkCapability(float, "fac-metro", [])).toBe(false);
  });

  it("lets an explicit context override the current facility", () => {
    expect(checkCapability(float, "fac-metro", "note.sign", { facilityId: "fac-lakeside" })).toBe(true);
  });

  it("never gives a patient a staff capability", () => {
    const patient = principalOf("patient@ascehr.demo");
    expect(checkCapability(patient, null, "portal.self.read")).toBe(true);
    expect(checkCapability(patient, null, ["note.sign", "patient.read", "audit.read"])).toBe(false);
  });
});
