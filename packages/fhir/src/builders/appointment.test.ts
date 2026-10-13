import { describe, expect, it } from "vitest";

import { buildAppointment } from "./appointment.js";

const base = { facilityId: "fac-1", patientId: "pat-1", start: "2026-10-08T09:00:00Z", end: "2026-10-08T10:00:00Z" } as const;

describe("buildAppointment", () => {
  it("books the patient into a slot of one facility", () => {
    expect(buildAppointment(base)).toEqual({
      resourceType: "Appointment",
      meta: { accounts: [{ reference: "Organization/fac-1" }] },
      status: "booked",
      start: "2026-10-08T09:00:00Z",
      end: "2026-10-08T10:00:00Z",
      participant: [{ actor: { reference: "Patient/pat-1" }, status: "accepted" }],
    });
  });

  it("adds the room, the practitioners and a description in order", () => {
    const appointment = buildAppointment({ ...base, roomId: "room-1", practitionerIds: ["doc-1", "crna-1"], description: "Colonoscopy" });
    expect(appointment.participant?.map((participant) => participant.actor?.reference)).toEqual(["Patient/pat-1", "Location/room-1", "Practitioner/doc-1", "Practitioner/crna-1"]);
    expect(appointment.description).toBe("Colonoscopy");
  });

  it("adds physicianId and anesthesiologistId with participation types", () => {
    const appointment = buildAppointment({
      ...base,
      roomId: "room-1",
      physicianId: "doc-1",
      anesthesiologistId: "crna-1",
    });
    expect(appointment.participant).toEqual([
      { actor: { reference: "Patient/pat-1" }, status: "accepted" },
      { actor: { reference: "Location/room-1" }, status: "accepted" },
      {
        actor: { reference: "Practitioner/doc-1" },
        status: "accepted",
        type: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ParticipationType", code: "PPRF", display: "primary performer" }] }],
      },
      {
        actor: { reference: "Practitioner/crna-1" },
        status: "accepted",
        type: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ParticipationType", code: "SPRF", display: "secondary performer" }] }],
      },
    ]);
  });

  it("rejects a range that does not run forward, bad times and ids, without echoing them", () => {
    expect(() => buildAppointment({ ...base, end: base.start })).toThrow("invalid appointment time range");
    expect(() => buildAppointment({ ...base, end: "2026-10-08T08:00:00Z" })).toThrow("invalid appointment time range");
    expect(() => buildAppointment({ ...base, start: "2026-10-08" })).toThrow("invalid appointment start");
    expect(() => buildAppointment({ ...base, end: "later" })).toThrow("invalid appointment end");
    expect(() => buildAppointment({ ...base, patientId: "" })).toThrow("invalid patient id");
    expect(() => buildAppointment({ ...base, roomId: "a b" })).toThrow("invalid room id");
    expect(() => buildAppointment({ ...base, physicianId: "bad doc" })).toThrow("invalid physician id");
    expect(() => buildAppointment({ ...base, anesthesiologistId: "bad crna" })).toThrow("invalid anesthesiologist id");
    expect(() => buildAppointment({ ...base, practitionerIds: ["x/y"] })).toThrow("invalid practitioner id");
    expect(() => buildAppointment({ ...base, description: " " })).toThrow("invalid appointment description");
    expect(() => buildAppointment({ ...base, facilityId: "" })).toThrow("invalid facility id");
  });
});
