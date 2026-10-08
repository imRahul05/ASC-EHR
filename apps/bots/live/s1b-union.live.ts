import type { Bundle, Composition, Patient } from "@medplum/fhirtypes";
import { beforeAll, describe, expect, it } from "vitest";

import { liveContext, spikeCondition, spikeIdentifier } from "./harness.js";

/**
 * Spike S1b (Medplum 5.1.42): a membership with two access entries. How do `hiddenFields`, `readonly`,
 * `writeConstraint` and facility criteria combine? Characterization: these pin the live behaviour so a
 * Medplum upgrade that changes it fails here. Consequences are written down in the ADR.
 */
const ctx = liveContext();
const ids: Record<string, string> = {};
let strictId = "";
let looseId = "";
let strictNoteId = "";
let looseNoteId = "";
let strictScopedId = "";
let facilityA = "";
let facilityB = "";

const entriesOf = (order: string[]) => order.map((policyId) => ctx.access(policyId));
const account = (facilityId: string) => ({ account: { reference: `Organization/${facilityId}` } });

beforeAll(async () => {
  facilityA = await ctx.facility("A");
  facilityB = await ctx.facility("B");
  strictId = (await ctx.policy({ resourceType: "AccessPolicy", name: "spike-s1b-strict", resource: [{ resourceType: "Patient", readonly: true, hiddenFields: ["birthDate"] }] })).id;
  looseId = (await ctx.policy({ resourceType: "AccessPolicy", name: "spike-s1b-loose", resource: [{ resourceType: "Patient" }] })).id;
  strictNoteId = (
    await ctx.policy({
      resourceType: "AccessPolicy",
      name: "spike-s1b-strict-note",
      resource: [{ resourceType: "Composition", writeConstraint: [{ language: "text/fhirpath", expression: "%before.exists() implies %before.status != 'final'" }] }],
    })
  ).id;
  strictScopedId = (
    await ctx.policy({
      resourceType: "AccessPolicy",
      name: "spike-s1b-strict-note-scoped",
      resource: [{ resourceType: "Composition", criteria: "Composition?_compartment=%facility", writeConstraint: [{ language: "text/fhirpath", expression: "%before.exists() implies %before.status != 'final'" }] }],
    })
  ).id;
  looseNoteId = (await ctx.policy({ resourceType: "AccessPolicy", name: "spike-s1b-loose-note", resource: [{ resourceType: "Composition" }] })).id;

  const patient = await ctx.admin.createResourceIfNoneExist<Patient>(
    { resourceType: "Patient", name: [{ family: "Spike-s1b" }], birthDate: "1980-01-01", identifier: [spikeIdentifier("s1b-patient")], meta: account(facilityA) },
    spikeCondition("s1b-patient"),
  );
  ids.patient = patient.id ?? "";
  const note = await ctx.admin.createResourceIfNoneExist<Composition>(
    { resourceType: "Composition", status: "final", type: { text: "spike" }, date: "2026-01-01T00:00:00Z", author: [{ display: "spike" }], title: "spike s1b", identifier: spikeIdentifier("s1b-final-note"), meta: account(facilityA) },
    spikeCondition("s1b-final-note"),
  );
  ids.note = note.id ?? "";
  for (const [key, facilityId] of [["note-A", facilityA], ["note-B", facilityB]] as const) {
    const draft = await ctx.admin.createResourceIfNoneExist<Composition>(
      { resourceType: "Composition", status: "preliminary", type: { text: "spike" }, date: "2026-01-01T00:00:00Z", author: [{ display: "spike" }], title: `spike s1b ${key}`, identifier: spikeIdentifier(`s1b-${key}`), meta: account(facilityId) },
      spikeCondition(`s1b-${key}`),
    );
    ids[key] = draft.id ?? "";
  }
  for (const key of ["A", "B"]) {
    const found = await ctx.admin.createResourceIfNoneExist<Patient>(
      { resourceType: "Patient", name: [{ family: `Spike-s1b-${key}` }], identifier: [spikeIdentifier(`s1b-facility-${key}`)], meta: account(key === "A" ? facilityA : facilityB) },
      spikeCondition(`s1b-facility-${key}`),
    );
    ids[`facility-${key}`] = found.id ?? "";
  }
});

describe.each([
  ["strict then loose", () => [strictId, looseId]],
  ["loose then strict", () => [looseId, strictId]],
])("S1b hiddenFields and readonly (%s)", (label, order) => {
  it("hides a field if ANY entry hides it, whatever the order", async () => {
    const { caller } = await ctx.persona(`spike-s1b-fields-${label.replace(" ", "-")}`, entriesOf(order()));
    const read = await caller.request("GET", `fhir/R4/Patient/${ids.patient}`);
    expect(read.status).toBe(200);
    expect((read.body as Patient).birthDate).toBeUndefined();
  });

  it("allows a write if ANY entry allows it (readonly is permissive)", async () => {
    const { caller } = await ctx.persona(`spike-s1b-fields-${label.replace(" ", "-")}`, entriesOf(order()));
    const read = (await caller.request("GET", `fhir/R4/Patient/${ids.patient}`)).body as Patient;
    const write = await caller.request("PUT", `fhir/R4/Patient/${ids.patient}`, { ...read, meta: { ...read.meta, ...account(facilityA) } });
    expect(write.status).toBe(200);
  });
});

describe.each([
  ["strict then loose", () => [strictNoteId, looseNoteId], 403],
  ["loose then strict", () => [looseNoteId, strictNoteId], 200],
] as const)("S1b writeConstraint (%s)", (label, order, expected) => {
  it(`gives ${expected}: a constraint only applies when its entry comes before one without it (order-dependent, unlike hiddenFields and readonly)`, async () => {
    const { caller } = await ctx.persona(`spike-s1b-notes-${label.replace(" ", "-")}`, entriesOf(order()));
    const read = (await caller.request("GET", `fhir/R4/Composition/${ids.note}`)).body as Composition;
    const write = await caller.request("PUT", `fhir/R4/Composition/${ids.note}`, { ...read, title: `spike s1b ${Date.now()}` });
    expect(write.status).toBe(expected);
  });
});

describe("S1b writeConstraint control", () => {
  it.each([
    ["strict entry alone", () => [strictNoteId], 403],
    ["permissive entry alone", () => [looseNoteId], 200],
    ["strict entry with criteria", () => [strictScopedId], 403],
  ] as const)("%s", async (label, order, expected) => {
    const { caller } = await ctx.persona(`spike-s1b-control-${label.replaceAll(" ", "-")}`, order().map((id) => ctx.access(id, id === strictScopedId ? facilityA : undefined)));
    const read = (await caller.request("GET", `fhir/R4/Composition/${ids.note}`)).body as Composition;
    const write = await caller.request("PUT", `fhir/R4/Composition/${ids.note}`, { ...read, title: `spike s1b ${Date.now()}`, meta: { ...read.meta, ...account(facilityA) } });
    expect(write.status).toBe(expected);
  });
});

describe("S1b facility criteria", () => {
  it("unions facilities: two entries with different %facility values see both", async () => {
    const policy = (await ctx.rolePolicy("rn")).id;
    const { caller } = await ctx.persona("spike-s1b-two-facilities", [ctx.access(policy, facilityA), ctx.access(policy, facilityB)]);
    const found = await caller.request("GET", `fhir/R4/Patient?identifier=${encodeURIComponent("urn:asc-ehr:spike|")}`);
    const names = ((found.body as Bundle<Patient>).entry ?? [])
      .map((entry) => entry.resource?.name?.[0]?.family ?? "")
      .filter((family) => family.startsWith("Spike-s1b-"))
      .sort();
    expect(names).toEqual(["Spike-s1b-A", "Spike-s1b-B"]);
  });
});

describe("S1b entries keep their own facility", () => {
  it("does not let rn at A plus physician at B write at A (cross-facility escalation)", async () => {
    const rn = (await ctx.rolePolicy("rn")).id;
    const physician = (await ctx.rolePolicy("gi-physician")).id;
    const { caller } = await ctx.persona("spike-s1b-escalation", [ctx.access(rn, facilityA), ctx.access(physician, facilityB)]);
    for (const [key, facilityId, expected] of [["note-A", facilityA, 403], ["note-B", facilityB, 200]] as const) {
      const read = (await caller.request("GET", `fhir/R4/Composition/${ids[key]}`)).body as Composition;
      const write = await caller.request("PUT", `fhir/R4/Composition/${ids[key]}`, { ...read, title: `spike s1b ${key}`, meta: { ...read.meta, ...account(facilityId) } });
      expect(write.status).toBe(expected);
    }
  });
});
