import type { Appointment, Location, Patient, Practitioner } from "@medplum/fhirtypes";
import { facilityMeta, instant, reference, text } from "@asc/fhir/builders/common";

type Participant = NonNullable<Appointment["participant"]>[number];

export interface AppointmentInput {
  readonly facilityId: string;
  readonly patientId: string;
  /** FHIR instants with an explicit time zone. */
  readonly start: string;
  readonly end: string;
  /** The room (a Location) the case is booked into. */
  readonly roomId?: string;
  readonly practitionerIds?: readonly string[];
  readonly description?: string;
}

/** A booked slot for one patient at one facility. The matching case is the Encounter (`buildCaseEncounter`). */
export function buildAppointment(input: AppointmentInput): Appointment {
  const start = instant(input.start, "appointment start");
  const end = instant(input.end, "appointment end");
  if (Date.parse(end) <= Date.parse(start)) throw new Error("invalid appointment time range");
  const participant: Participant[] = [
    { actor: reference<Patient>("Patient", input.patientId, "patient id"), status: "accepted" },
    ...(input.roomId === undefined ? [] : [{ actor: reference<Location>("Location", input.roomId, "room id"), status: "accepted" as const }]),
    ...(input.practitionerIds ?? []).map((id) => ({ actor: reference<Practitioner>("Practitioner", id, "practitioner id"), status: "accepted" as const })),
  ];
  return {
    resourceType: "Appointment",
    meta: facilityMeta(input.facilityId),
    status: "booked",
    start,
    end,
    participant,
    ...(input.description === undefined ? {} : { description: text(input.description, "appointment description") }),
  };
}
