import { ROLE_TEMPLATES } from "@asc/authz";
import type { Bundle, Composition, Location, Patient } from "@medplum/fhirtypes";
import { beforeAll, describe, expect, it } from "vitest";

import { type Caller, liveContext, seedOutput, spikeCondition, spikeIdentifier } from "./harness.js";

/**
 * Policy test against the SEEDED access model: each persona holds exactly the access list of the seeded
 * demo membership of its role, and the expectations are derived from the role template, so the compiler,
 * the seed and Medplum are checked together. Needs `pnpm medplum:seed` (it reads apps/bots/.seed-output.json).
 */
const ctx = liveContext();
const seeded = seedOutput();
const staff = ROLE_TEMPLATES.filter((template) => template.key !== "patient");
const types = [...new Set(staff.flatMap((template) => template.data.map((rule) => rule.resourceType)))].sort();
const personas = new Map<string, Caller>();
const ids: Record<string, string> = {};
const account = (facilityId: string) => ({ account: { reference: `Organization/${facilityId}` } });

async function fixture<T extends Patient | Composition | Location>(key: string, resource: T): Promise<string> {
  const found = await ctx.admin.createResourceIfNoneExist<T>(resource, spikeCondition(key));
  return found.id ?? "";
}
const note = (key: string, facilityId: string, status: Composition["status"]) =>
  fixture<Composition>(key, { resourceType: "Composition", status, type: { text: "policy test" }, date: "2026-01-01T00:00:00Z", author: [{ display: "policy test" }], title: key, identifier: spikeIdentifier(key), meta: account(facilityId) });

beforeAll(async () => {
  const [f1, f2] = [seeded.facilityId, seeded.secondFacilityId];
  ids.patient1 = await fixture<Patient>("policy-patient-1", { resourceType: "Patient", name: [{ family: "Policy-test-1" }], identifier: [spikeIdentifier("policy-patient-1")], meta: account(f1) });
  ids.patient2 = await fixture<Patient>("policy-patient-2", { resourceType: "Patient", name: [{ family: "Policy-test-2" }], identifier: [spikeIdentifier("policy-patient-2")], meta: account(f2) });
  ids.draft1 = await note("policy-note-1-draft", f1, "preliminary");
  ids.final1 = await note("policy-note-1-final", f1, "final");
  ids.draft2 = await note("policy-note-2-draft", f2, "preliminary");
  ids.location = await fixture<Location>("policy-location", { resourceType: "Location", name: "Policy test location", identifier: [spikeIdentifier("policy-location")] });
  for (const template of staff) {
    const practitionerId = seeded.practitioners[template.key];
    const [membership] = await ctx.admin.searchResources("ProjectMembership", { profile: `Practitioner/${practitionerId}` });
    if (membership?.access === undefined) throw new Error(`no seeded membership for ${template.key}; run pnpm medplum:seed`);
    personas.set(template.key, (await ctx.persona(`policy-test-${template.key}`, membership.access)).caller);
  }
});

const who = (key: string) => personas.get(key) as Caller;
const get = (key: string, path: string) => who(key).request("GET", path);

describe.each(staff)("policy: $key", (template) => {
  const rule = (type: string) => template.data.find((candidate) => candidate.resourceType === type);

  it("can search exactly the resource types its template names, and gets 403 for every other", async () => {
    const wrong: string[] = [];
    for (const type of types) {
      const status = (await get(template.key, `fhir/R4/${type}?_count=1`)).status;
      if (status !== (rule(type) === undefined ? 403 : 200)) wrong.push(`${type}: ${status}`);
    }
    expect(wrong).toEqual([]);
  });

  it(template.facilityScoped ? "reads its own facility's records and gets 404 for the other facility's" : "reads the records of every facility (all-site role)", async () => {
    for (const [type, own, other] of [["Patient", ids.patient1, ids.patient2], ["Composition", ids.draft1, ids.draft2]] as const) {
      if (rule(type) === undefined) continue;
      expect((await get(template.key, `fhir/R4/${type}/${own}`)).status).toBe(200);
      expect((await get(template.key, `fhir/R4/${type}/${other}`)).status).toBe(template.facilityScoped ? 404 : 200);
    }
  });

  it("reads shared directory data without a facility tag, wherever its template names the type", async () => {
    for (const shared of template.data.filter((candidate) => candidate.shared === true)) {
      const path = shared.resourceType === "Location" ? `fhir/R4/Location/${ids.location}` : `fhir/R4/${shared.resourceType}?_count=1`;
      expect((await get(template.key, path)).status).toBe(200);
    }
  });

  it("writes a patient only where the template does not mark it readonly", async () => {
    const patient = rule("Patient");
    if (patient === undefined) return;
    const current = (await get(template.key, `fhir/R4/Patient/${ids.patient1}`)).body as Patient;
    const update = await who(template.key).request("PUT", `fhir/R4/Patient/${ids.patient1}`, { ...current, meta: { ...current.meta, ...account(seeded.facilityId) } });
    expect(update.status).toBe(patient.readonly === true ? 403 : 200);
  });

  it("locks a final note where the template says so, and never lets a readonly role write one", async () => {
    const composition = rule("Composition");
    if (composition === undefined) return;
    const edit = async (id: string) => {
      const current = (await get(template.key, `fhir/R4/Composition/${id}`)).body as Composition;
      return (await who(template.key).request("PUT", `fhir/R4/Composition/${id}`, { ...current, title: `${current.title} ${Date.now()}`, meta: { ...current.meta, ...account(seeded.facilityId) } })).status;
    };
    expect(await edit(ids.draft1 ?? "")).toBe(composition.readonly === true ? 403 : 200);
    expect(await edit(ids.final1 ?? "")).toBe(composition.readonly === true || composition.lockWhenFinal === true ? 403 : 200);
  });
});

describe("policy: a search is limited to the facility", () => {
  it("returns only the first facility's patients to a facility-scoped role, both to an all-site role", async () => {
    const names = async (key: string) =>
      (((await get(key, `fhir/R4/Patient?identifier=${encodeURIComponent("urn:asc-ehr:spike|")}`)).body as Bundle<Patient>).entry ?? [])
        .map((entry) => entry.resource?.name?.[0]?.family ?? "")
        .filter((family) => family.startsWith("Policy-test-"))
        .sort();
    expect(await names("rn")).toEqual(["Policy-test-1"]);
    expect(await names("coder")).toEqual(["Policy-test-1", "Policy-test-2"]);
  });
});
