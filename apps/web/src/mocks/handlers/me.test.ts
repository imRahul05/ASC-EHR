import { can } from "@asc/authz/can";
import { describe, expect, it } from "vitest";
import { openSession } from "../db/sessions";
import { meFor, resolveMe } from "./me";

describe("mock /me", () => {
  it("builds a staff principal with per-facility grants and facility names", () => {
    const me = meFor("float@ascehr.demo");
    expect(me?.principal.kind).toBe("staff");
    expect(me?.principal.grants.map((g) => (g.scope === "facility" ? g.facilityId : "all"))).toEqual([
      "fac-metro",
      "fac-lakeside",
    ]);
    expect(me?.facilities.map((f) => f.id)).toEqual(["fac-metro", "fac-lakeside"]);
  });

  it("lists only facilities named by facility grants (all-site roles add none) and gives a patient a patient principal", () => {
    expect(meFor("admin@ascehr.demo")?.facilities.map((f) => f.id)).toEqual(["fac-metro"]);
    expect(meFor("patient@ascehr.demo")?.facilities).toEqual([]);
    const patient = meFor("patient@ascehr.demo")?.principal;
    expect(patient).toMatchObject({ kind: "patient", patientId: "pat_105" });
    if (patient) expect(can(patient, "note.sign")).toBe(false);
  });

  it("returns nothing for an unknown email or Object.prototype names", () => {
    expect(meFor("nobody@example.com")).toBeUndefined();
    expect(meFor("toString")).toBeUndefined();
  });

  it("resolves a bearer token opened by a sign-in, and rejects everything else with 401", () => {
    openSession("token-nurse", "nurse@ascehr.demo");
    const ok = resolveMe("Bearer token-nurse");
    expect(ok.status).toBe(200);
    expect(resolveMe("Bearer not-a-token")).toEqual({ status: 401 });
    expect(resolveMe("token-nurse")).toEqual({ status: 401 });
    expect(resolveMe(null)).toEqual({ status: 401 });
    openSession("token-ghost", "ghost@example.com");
    expect(resolveMe("Bearer token-ghost")).toEqual({ status: 401 });
  });
});
