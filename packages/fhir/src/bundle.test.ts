import type { Encounter, Practitioner } from "@medplum/fhirtypes";
import { describe, expect, it } from "vitest";

import { buildAppointment } from "./builders/appointment.js";
import { buildCaseEncounter } from "./builders/encounter.js";
import { buildPatient } from "./builders/patient.js";
import { createTransaction } from "./bundle.js";

const facilityId = "fac-1";
const counter = () => {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
};
const patient = buildPatient({ facilityId, name: { family: "Canary-Name", given: ["Test"] } });

describe("createTransaction", () => {
  it("builds a transaction of POST entries with urn:uuid full URLs", () => {
    const tx = createTransaction({ facilityId, newId: counter() });
    tx.add("patient", patient);
    expect(tx.build()).toEqual({
      resourceType: "Bundle",
      type: "transaction",
      entry: [{ fullUrl: "urn:uuid:00000000-0000-4000-8000-000000000001", resource: patient, request: { method: "POST", url: "Patient" } }],
    });
  });

  it("links entries by the reference add() returns, and allows a forward reference", () => {
    const tx = createTransaction({ facilityId, newId: counter() });
    const encounterRef = tx.ref("encounter"); // used before the encounter is added
    const patientRef = tx.add("patient", patient);
    const appointment = buildAppointment({ facilityId, patientId: "pat-1", start: "2026-10-08T09:00:00Z", end: "2026-10-08T10:00:00Z" });
    tx.add("appointment", appointment);
    const encounter: Encounter = { ...buildCaseEncounter({ facilityId, patientId: "pat-1", phase: "SCHEDULED" }), subject: patientRef };
    expect(tx.add("encounter", encounter)).toEqual(encounterRef);
    const bundle = tx.build();
    expect(bundle.entry?.map((entry) => entry.request?.url)).toEqual(["Patient", "Appointment", "Encounter"]);
    expect(bundle.entry?.[2]?.resource).toMatchObject({ subject: { reference: bundle.entry?.[0]?.fullUrl } });
    expect(bundle.entry?.[2]?.fullUrl).toBe(encounterRef.reference);
  });

  it("makes a create conditional on request", () => {
    const tx = createTransaction({ facilityId, newId: counter() });
    tx.add("patient", patient, { ifNoneExist: "identifier=urn:x|1" });
    expect(tx.build().entry?.[0]?.request).toEqual({ method: "POST", url: "Patient", ifNoneExist: "identifier=urn:x|1" });
  });

  it("accepts tenant-wide directory data without a facility tag, and nothing else", () => {
    const tx = createTransaction({ facilityId, newId: counter() });
    const practitioner: Practitioner = { resourceType: "Practitioner", name: [{ family: "Canary" }] };
    expect(() => tx.add("doc", practitioner)).not.toThrow();
    for (const [resourceType, key] of [["PractitionerRole", "role"], ["Organization", "org"], ["Location", "loc"]] as const) {
      expect(() => tx.add(key, { resourceType })).not.toThrow();
    }
    expect(() => tx.add("untagged", { resourceType: "Patient" })).toThrow("Patient is not tagged with the transaction's facility");
  });

  it("accepts a directory resource tagged with the transaction's facility and refuses one tagged for another", () => {
    const tx = createTransaction({ facilityId, newId: counter() });
    expect(() => tx.add("here", { resourceType: "Location", meta: { account: { reference: "Organization/fac-1" } } })).not.toThrow();
    expect(() => tx.add("there", { resourceType: "Location", meta: { account: { reference: "Organization/fac-2" } } })).toThrow("Location is not tagged with the transaction's facility");
  });

  it("refuses an entry that belongs to another facility", () => {
    const other = buildPatient({ facilityId: "fac-2", name: { family: "Canary-Name", given: ["Test"] } });
    expect(() => createTransaction({ facilityId }).add("patient", other)).toThrow("is not tagged with the transaction's facility");
  });

  it("refuses duplicate keys, empty or over-long keys, and entries that were referenced but never added", () => {
    const tx = createTransaction({ facilityId, newId: counter() });
    tx.add("patient", patient);
    expect(() => tx.add("patient", patient)).toThrow("duplicate transaction key");
    expect(() => tx.ref("")).toThrow("invalid transaction key");
    expect(() => tx.ref("k".repeat(65))).toThrow("invalid transaction key");
    tx.ref("missing-1");
    tx.ref("missing-2");
    expect(() => tx.build()).toThrow("transaction refers to 2 entry(ies) that were never added");
  });

  it("rejects a facility id that is not a FHIR id", () => {
    expect(() => createTransaction({ facilityId: "" })).toThrow("invalid facility id");
    expect(() => createTransaction({ facilityId: "a/b" })).toThrow("invalid facility id");
  });

  it("keeps the same url for a key however often it is asked for", () => {
    const tx = createTransaction({ facilityId, newId: counter() });
    expect(tx.ref("a")).toEqual(tx.ref("a"));
    expect(tx.ref("a")).not.toEqual(tx.ref("b"));
  });

  it("uses random UUIDs by default", () => {
    const tx = createTransaction({ facilityId });
    expect(tx.add("patient", patient).reference).toMatch(/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
