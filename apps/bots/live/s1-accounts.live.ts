import type { Composition } from "@medplum/fhirtypes";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type Caller, liveContext } from "./harness.js";

/**
 * Spike S1 with `meta.accounts` (Medplum 5.1.42): the plural field that replaces the deprecated
 * `meta.account` binds a resource to its facility exactly as S1 measured for the singular one.
 * `@asc/fhir` builders stamp `meta.accounts`, so this pins the field they rely on.
 */
const ctx = liveContext();

let facilityA = "";
let facilityB = "";
let physicianAtA: Caller;
let rnAtB: Caller;
const created: string[] = [];

const accounts = (facilityId: string) => ({ accounts: [{ reference: `Organization/${facilityId}` }] });

const note = (facilityId: string): Composition => ({
  resourceType: "Composition",
  status: "preliminary",
  type: { text: "spike note" },
  date: "2026-01-01T00:00:00Z",
  author: [{ display: "spike" }],
  title: "spike accounts note",
  meta: accounts(facilityId),
});

beforeAll(async () => {
  facilityA = await ctx.facility("A");
  facilityB = await ctx.facility("B");
  const policy = async (role: string) => (await ctx.rolePolicy(role)).id;
  physicianAtA = (await ctx.persona("spike-accounts-gi-physician-A", [ctx.access(await policy("gi-physician"), facilityA)])).caller;
  rnAtB = (await ctx.persona("spike-accounts-rn-B", [ctx.access(await policy("rn"), facilityB)])).caller;
});

afterAll(async () => {
  for (const id of created) await ctx.admin.deleteResource("Composition", id);
});

describe("S1 facility compartment with meta.accounts", () => {
  it("lets a physician at A create and update a note in A's accounts", async () => {
    const create = await physicianAtA.request("POST", "fhir/R4/Composition", note(facilityA));
    expect(create.status).toBe(201);
    const saved = create.body as Composition;
    created.push(saved.id ?? "");
    // A facility user's response leaves the compartments out; the admin read shows where the note is stored.
    const stored = await ctx.admin.readResource("Composition", saved.id ?? "");
    expect(stored.meta?.accounts?.map((entry) => entry.reference)).toEqual([`Organization/${facilityA}`]);
    expect(stored.meta?.compartment?.map((entry) => entry.reference)).toContain(`Organization/${facilityA}`);
    const update = await physicianAtA.request("PUT", `fhir/R4/Composition/${saved.id}`, { ...saved, title: "spike accounts note (edited)", meta: accounts(facilityA) });
    expect(update.status).toBe(200);
  });

  it("refuses to create a note in B's accounts or move A's note there", async () => {
    expect((await physicianAtA.request("POST", "fhir/R4/Composition", note(facilityB))).status).toBe(403);
    const id = created[0] ?? "";
    const current = (await physicianAtA.request("GET", `fhir/R4/Composition/${id}`)).body as Composition;
    expect((await physicianAtA.request("PUT", `fhir/R4/Composition/${id}`, { ...current, meta: accounts(facilityB) })).status).toBe(403);
  });

  it("hides A's note from a nurse at B as not found", async () => {
    expect((await rnAtB.request("GET", `fhir/R4/Composition/${created[0] ?? ""}`)).status).toBe(404);
  });

  it("still refuses a read-modify-write that drops the accounts: the writer must stamp them", async () => {
    const id = created[0] ?? "";
    const read = await physicianAtA.request("GET", `fhir/R4/Composition/${id}`);
    expect(Object.keys((read.body as Composition).meta ?? {}).sort()).toEqual(["lastUpdated", "versionId"]);
    expect((await physicianAtA.request("PUT", `fhir/R4/Composition/${id}`, read.body)).status).toBe(403);
  });
});
