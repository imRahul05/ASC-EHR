import { describe, expect, it } from "vitest";

import { readCasePhase } from "../extensions.js";
import { createFhirUrls } from "../urls.js";
import { buildCaseEncounter, ENCOUNTER_STATUS_BY_PHASE } from "./encounter.js";

const base = { facilityId: "fac-1", patientId: "pat-1", phase: "SCHEDULED" } as const;

describe("buildCaseEncounter", () => {
  it("is the case: facility, patient, status and the case-phase extension", () => {
    const encounter = buildCaseEncounter(base);
    expect(encounter).toMatchObject({
      resourceType: "Encounter",
      meta: { accounts: [{ reference: "Organization/fac-1" }] },
      status: "planned",
      class: { code: "AMB" },
      subject: { reference: "Patient/pat-1" },
      serviceProvider: { reference: "Organization/fac-1" },
    });
    expect(readCasePhase(encounter.extension)).toBe("SCHEDULED");
    expect(encounter).not.toHaveProperty("identifier");
    expect(encounter).not.toHaveProperty("appointment");
    expect(encounter).not.toHaveProperty("location");
    expect(encounter).not.toHaveProperty("period");
  });

  it("adds the case number, appointment, location and period when given", () => {
    const encounter = buildCaseEncounter({
      ...base,
      phase: "IN_PROCEDURE",
      caseNumber: "ASC1-20261008-0001",
      appointmentId: "appt-1",
      locationId: "room-2",
      start: "2026-10-08T09:00:00Z",
      end: "2026-10-08T10:00:00Z",
    });
    expect(encounter.status).toBe("in-progress");
    expect(encounter.identifier).toEqual([{ system: "https://fhir.wybit.io/asc/identifier/case-number", value: "ASC1-20261008-0001" }]);
    expect(encounter.appointment).toEqual([{ reference: "Appointment/appt-1" }]);
    expect(encounter.location).toEqual([{ location: { reference: "Location/room-2" }, status: "active" }]);
    expect(encounter.period).toEqual({ start: "2026-10-08T09:00:00Z", end: "2026-10-08T10:00:00Z" });
  });

  it("refuses a period that ends before it starts, and allows an instant", () => {
    expect(() => buildCaseEncounter({ ...base, start: "2026-10-08T10:00:00Z", end: "2026-10-08T09:00:00Z" })).toThrow("invalid case period range");
    expect(buildCaseEncounter({ ...base, start: "2026-10-08T10:00:00Z", end: "2026-10-08T10:00:00Z" }).period).toEqual({ start: "2026-10-08T10:00:00Z", end: "2026-10-08T10:00:00Z" });
  });

  it("accepts a start without an end and an end without a start", () => {
    expect(buildCaseEncounter({ ...base, start: "2026-10-08T09:00:00Z" }).period).toEqual({ start: "2026-10-08T09:00:00Z" });
    expect(buildCaseEncounter({ ...base, end: "2026-10-08T10:00:00Z" }).period).toEqual({ end: "2026-10-08T10:00:00Z" });
  });

  it("maps every phase to a status, grouping the stopped ones as cancelled", () => {
    expect(Object.keys(ENCOUNTER_STATUS_BY_PHASE)).toHaveLength(15);
    expect(ENCOUNTER_STATUS_BY_PHASE.NO_SHOW).toBe("cancelled");
    expect(ENCOUNTER_STATUS_BY_PHASE.CLOSED).toBe("finished");
    expect(ENCOUNTER_STATUS_BY_PHASE.ARRIVED).toBe("arrived");
  });

  it("follows a different base and rejects bad ids and times", () => {
    const other = buildCaseEncounter(base, createFhirUrls("https://fhir.example.test/x/"));
    expect(other.extension?.[0]?.url).toBe("https://fhir.example.test/x/StructureDefinition/case-phase");
    expect(() => buildCaseEncounter({ ...base, patientId: "" })).toThrow("invalid patient id");
    expect(() => buildCaseEncounter({ ...base, facilityId: "a b" })).toThrow("invalid facility id");
    expect(() => buildCaseEncounter({ ...base, appointmentId: "/" })).toThrow("invalid appointment id");
    expect(() => buildCaseEncounter({ ...base, locationId: "" })).toThrow("invalid location id");
    expect(() => buildCaseEncounter({ ...base, start: "2026-10-08" })).toThrow("invalid case start");
    expect(() => buildCaseEncounter({ ...base, end: "tomorrow" })).toThrow("invalid case end");
  });
});
