import type { Bundle, Composition, Patient } from "@medplum/fhirtypes";
import { beforeAll, describe, expect, it } from "vitest";

import { type Caller, liveContext, spikeCondition, spikeIdentifier } from "./harness.js";

/**
 * Spike S1 (Medplum 5.1.42): the compiled policies do what 08 §7.4 assumes.
 * Facility criteria `_compartment=%facility` bound per membership, `writeConstraint` on a final
 * Composition, and shared directory data readable without a facility tag.
 * Characterization: each assertion pins what the live server does today.
 */
const ctx = liveContext();

let facilityA = "";
let facilityB = "";
const ids: Record<string, string> = {};
let rnAtA: Caller;
let frontDeskAtA: Caller;
let physicianAtA: Caller;

/** A facility user's write must name its facility: the criteria are checked against the new version. */
const inFacility = (body: unknown) => {
  const resource = body as { meta?: object };
  return { ...resource, meta: { ...resource.meta, account: { reference: `Organization/${facilityA}` } } };
};

async function composition(key: string, facilityId: string, status: Composition["status"]) {
  const created = await ctx.admin.createResourceIfNoneExist<Composition>(
    {
      resourceType: "Composition",
      status,
      type: { text: "spike note" },
      date: "2026-01-01T00:00:00Z",
      author: [{ display: "spike" }],
      title: `spike ${key}`,
      identifier: spikeIdentifier(key),
      meta: { account: { reference: `Organization/${facilityId}` } },
    },
    spikeCondition(key),
  );
  return created.id ?? "";
}

beforeAll(async () => {
  facilityA = await ctx.facility("A");
  facilityB = await ctx.facility("B");
  for (const [key, facilityId] of [["patient-A", facilityA], ["patient-B", facilityB]] as const) {
    const patient = await ctx.admin.createResourceIfNoneExist(
      { resourceType: "Patient", name: [{ family: `Spike-${key}` }], identifier: [spikeIdentifier(key)], meta: { account: { reference: `Organization/${facilityId}` } } },
      spikeCondition(key),
    );
    ids[key] = patient.id ?? "";
  }
  ids["note-A-draft"] = await composition("note-A-draft", facilityA, "preliminary");
  ids["note-A-final"] = await composition("note-A-final", facilityA, "final");
  ids["note-B-draft"] = await composition("note-B-draft", facilityB, "preliminary");
  const practitioner = await ctx.admin.createResourceIfNoneExist({ resourceType: "Practitioner", name: [{ family: "Spike-directory" }], identifier: [spikeIdentifier("directory")] }, spikeCondition("directory"));
  ids.directory = practitioner.id ?? "";

  const policy = async (role: string) => (await ctx.rolePolicy(role)).id;
  rnAtA = (await ctx.persona("spike-s1-rn-A", [ctx.access(await policy("rn"), facilityA)])).caller;
  frontDeskAtA = (await ctx.persona("spike-s1-front-desk-A", [ctx.access(await policy("front-desk"), facilityA)])).caller;
  physicianAtA = (await ctx.persona("spike-s1-gi-physician-A", [ctx.access(await policy("gi-physician"), facilityA)])).caller;
});

describe("S1 facility compartment (_compartment=%facility with meta.account)", () => {
  it("lets a nurse at A read A's patient and hides B's as not found", async () => {
    expect((await rnAtA.request("GET", `fhir/R4/Patient/${ids["patient-A"]}`)).status).toBe(200);
    expect((await rnAtA.request("GET", `fhir/R4/Patient/${ids["patient-B"]}`)).status).toBe(404);
  });

  it("filters a search to the facility instead of failing", async () => {
    const found = await rnAtA.request("GET", `fhir/R4/Patient?identifier=${encodeURIComponent("urn:asc-ehr:spike|")}`);
    expect(found.status).toBe(200);
    const names = ((found.body as Bundle<Patient>).entry ?? []).map((entry) => entry.resource?.name?.[0]?.family ?? "");
    expect(names.filter((family) => family.startsWith("Spike-patient-"))).toEqual(["Spike-patient-A"]);
  });

  it("hides B's note from a nurse at A", async () => {
    expect((await rnAtA.request("GET", `fhir/R4/Composition/${ids["note-B-draft"]}`)).status).toBe(404);
  });
});

describe("S1 shared directory data", () => {
  it("stays readable without a facility tag", async () => {
    expect((await rnAtA.request("GET", `fhir/R4/Practitioner/${ids.directory}`)).status).toBe(200);
    expect((await frontDeskAtA.request("GET", `fhir/R4/Practitioner/${ids.directory}`)).status).toBe(200);
  });
});

describe("S1 Composition rules", () => {
  it("denies the front desk every Composition read and search with 403 (the search fails, it is not empty)", async () => {
    expect((await frontDeskAtA.request("GET", `fhir/R4/Composition/${ids["note-A-draft"]}`)).status).toBe(403);
    expect((await frontDeskAtA.request("GET", "fhir/R4/Composition")).status).toBe(403);
  });

  it("makes a nurse's Composition read-only", async () => {
    const read = await rnAtA.request("GET", `fhir/R4/Composition/${ids["note-A-draft"]}`);
    expect(read.status).toBe(200);
    expect((await rnAtA.request("PUT", `fhir/R4/Composition/${ids["note-A-draft"]}`, inFacility(read.body))).status).toBe(403);
  });

  it("lets a physician edit a draft note but not a final one (writeConstraint on %before)", async () => {
    for (const [key, expected] of [["note-A-draft", 200], ["note-A-final", 403]] as const) {
      const current = (await physicianAtA.request("GET", `fhir/R4/Composition/${ids[key]}`)).body as Composition;
      const update = await physicianAtA.request("PUT", `fhir/R4/Composition/${ids[key]}`, inFacility({ ...current, title: `spike ${key}` }));
      expect(update.status).toBe(expected);
    }
  });

  it("refuses a facility user's write that drops meta.account: a plain read does not return it, so the writer must stamp it", async () => {
    const read = await physicianAtA.request("GET", `fhir/R4/Composition/${ids["note-A-draft"]}`);
    expect(Object.keys((read.body as Composition).meta ?? {}).sort()).toEqual(["lastUpdated", "versionId"]);
    expect((await physicianAtA.request("PUT", `fhir/R4/Composition/${ids["note-A-draft"]}`, read.body)).status).toBe(403);
    expect((await physicianAtA.request("PUT", `fhir/R4/Composition/${ids["note-A-draft"]}`, inFacility(read.body))).status).toBe(200);
  });

  it("does not stop a physician creating a note as final or flipping a draft to final: signing is gated by the API capability", async () => {
    const draft = (await physicianAtA.request("GET", `fhir/R4/Composition/${ids["note-A-draft"]}`)).body as Composition;
    const create = await physicianAtA.request("POST", "fhir/R4/Composition", inFacility({ ...draft, id: undefined, identifier: undefined, meta: undefined, status: "final" }));
    expect(create.status).toBe(201);
    await ctx.admin.deleteResource("Composition", (create.body as Composition).id ?? "");
    const flip = await physicianAtA.request("PUT", `fhir/R4/Composition/${ids["note-A-draft"]}`, inFacility({ ...draft, status: "final" }));
    expect(flip.status).toBe(200);
    // Put the draft back (admin) so the test can run again.
    await ctx.admin.updateResource({ ...draft, status: "preliminary", meta: { account: { reference: `Organization/${facilityA}` } } });
  });
});
