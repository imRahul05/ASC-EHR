import { describe, expect, it } from "vitest";
import type { Observation } from "@medplum/fhirtypes";
import type { ProcedureEvent, StaffRef, TimeOutChecklist, TimeOutParticipant } from "@asc/types";

import {
  buildProcedureEventObservation,
  buildSurgicalTimeOutObservation,
  parseProcedureEventObservation,
  parseSurgicalTimeOutObservation,
} from "./procedure-capture.js";
import { createFhirUrls, LOINC_CODES } from "../urls.js";

const facilityId = "fac-1";
const caseId = "case-123";
const patientId = "pat-456";

describe("surgical timeout observation", () => {
  const checklist: TimeOutChecklist = {
    patientIdentity: true, procedureConfirmed: true, consentVerified: true,
    allergiesReviewed: true, equipmentReady: true, anticoagulationReviewed: true,
    siteAndLateralityConfirmed: true, prophylaxisReviewed: true, anticipatedIssuesReviewed: true,
  };

  const participants: readonly TimeOutParticipant[] = [
    { userId: "u-nurse", name: "Nurse Jackie", role: "circulating_rn", acknowledgedAt: "2026-09-20T08:00:00Z" },
    { userId: "u-doc", name: "Dr. Gregory House", role: "endoscopist", acknowledgedAt: "2026-09-20T08:00:10Z" },
    { userId: "u-anes", name: "Dr. Allison Cameron", role: "anesthesia", acknowledgedAt: "2026-09-20T08:00:20Z" },
    { userId: "u-tech", name: "Tech Bob", role: "tech", acknowledgedAt: "2026-09-20T08:00:30Z" },
  ];

  it("builds and parses timeout observation with custom urls, id, and timestamp", () => {
    const customUrls = createFhirUrls("https://fhir.example.test/x/");
    const obs = buildSurgicalTimeOutObservation({
      facilityId, caseId, patientId, checklist, participants,
      completedAt: "2026-09-20T08:00:35Z", id: "timeout-obs-1",
    }, customUrls);

    expect(obs.id).toBe("timeout-obs-1");
    expect(obs.code?.coding?.[0]?.code).toBe(LOINC_CODES.SURGICAL_TIMEOUT);
    expect(obs.encounter?.reference).toBe(`Encounter/${caseId}`);
    expect(obs.subject?.reference).toBe(`Patient/${patientId}`);
    expect(obs.effectiveDateTime).toBe("2026-09-20T08:00:35Z");
    expect(obs.performer).toHaveLength(4);

    const parsed = parseSurgicalTimeOutObservation(obs);
    expect(parsed.caseId).toBe(caseId);
    expect(parsed.fhirObservationId).toBe("timeout-obs-1");
    expect(parsed.completedAt).toBe("2026-09-20T08:00:35Z");
    expect(parsed.checklist.patientIdentity).toBe(true);
    expect(parsed.checklist.siteAndLateralityConfirmed).toBe(true);
    expect(parsed.participants).toHaveLength(4);
    expect(parsed.attestations).toHaveLength(4);
    expect(parsed.attestations[0]?.role).toBe("NURSE");
    expect(parsed.attestations[1]?.role).toBe("SURGEON");
    expect(parsed.attestations[2]?.role).toBe("ANESTHESIOLOGIST");
    expect(parsed.attestations[3]?.role).toBe("NURSE");
  });

  it("builds timeout observation with default completedAt and minimal checklist", () => {
    const minimalChecklist: TimeOutChecklist = {
      patientIdentity: false, procedureConfirmed: false, consentVerified: false,
      allergiesReviewed: false, equipmentReady: false, anticoagulationReviewed: false,
    };
    const obs = buildSurgicalTimeOutObservation({ facilityId, caseId, patientId, checklist: minimalChecklist, participants: [] });
    expect(obs.effectiveDateTime).toBeDefined();
    expect(obs.id).toBeUndefined();

    const parsed = parseSurgicalTimeOutObservation(obs);
    expect(parsed.checklist.patientIdentity).toBe(false);
    expect(parsed.checklist.siteAndLateralityConfirmed).toBeUndefined();
    expect(parsed.participants).toHaveLength(0);
  });

  it("handles malformed participant strings and missing references in parseSurgicalTimeOutObservation", () => {
    const malformedObs: Observation = {
      resourceType: "Observation", status: "final", code: { text: "Timeout" },
      component: [
        { code: { coding: [{ system: "https://fhir.wybit.io/asc/CodeSystem/timeout-checklist", code: "patientIdentity" }] } },
        { code: { coding: [{ system: "https://fhir.wybit.io/asc/CodeSystem/timeout-participant", code: "circulating_rn" }] }, valueString: "{bad json" },
        { code: { coding: [{ system: "other-system", code: "other" }] } },
      ],
    };
    const parsed = parseSurgicalTimeOutObservation(malformedObs);
    expect(parsed.caseId).toBe("");
    expect(parsed.checklist.patientIdentity).toBe(false);
    expect(parsed.participants).toHaveLength(0);

    const emptyParsed = parseSurgicalTimeOutObservation({ resourceType: "Observation", status: "final", code: { text: "Empty" } });
    expect(emptyParsed.participants).toHaveLength(0);
  });
});

describe("procedure event observation", () => {
  const staff: StaffRef = { id: "u-nurse", name: "Jackie RN", initials: "JR" };
  const event: ProcedureEvent = {
    id: "evt-1", caseId, type: "SCOPE_IN", at: "2026-09-20T08:15:00Z", by: staff, note: "Scope inserted smoothly",
  };

  it("builds and parses procedure event with note", () => {
    const obs = buildProcedureEventObservation({ facilityId, caseId, patientId, event });
    expect(obs.id).toBe("evt-1");
    expect(obs.code?.coding?.[0]?.code).toBe(LOINC_CODES.INTRAOP_EVENT);
    expect(obs.valueCodeableConcept?.coding?.[0]?.code).toBe("SCOPE_IN");
    expect(obs.note?.[0]?.text).toBe("Scope inserted smoothly");

    const parsed = parseProcedureEventObservation(obs);
    expect(parsed.id).toBe("evt-1");
    expect(parsed.caseId).toBe(caseId);
    expect(parsed.type).toBe("SCOPE_IN");
    expect(parsed.at).toBe("2026-09-20T08:15:00Z");
    expect(parsed.note).toBe("Scope inserted smoothly");
    expect(parsed.by.name).toBe("Jackie RN");
  });

  it("builds and parses procedure event without note and handles fallback parsing", () => {
    const eventNoNote: ProcedureEvent = { id: "evt-2", caseId, type: "ROOM_IN", at: "2026-09-20T07:50:00Z", by: staff };
    const obs = buildProcedureEventObservation({ facilityId, caseId, patientId, event: eventNoNote });
    expect(obs.note).toBeUndefined();
    const parsed = parseProcedureEventObservation(obs);
    expect(parsed.note).toBeUndefined();

    const emptyObs: Observation = {
      resourceType: "Observation", status: "final", code: { text: "Event" },
      performer: [{ reference: "Practitioner/doc-9" }],
      component: [{ code: { coding: [{ code: "staff" }] }, valueString: "{bad json" }],
    };
    const parsedFallback = parseProcedureEventObservation(emptyObs);
    expect(parsedFallback.id).toBe("");
    expect(parsedFallback.caseId).toBe("");
    expect(parsedFallback.type).toBe("ROOM_IN");
    expect(parsedFallback.by.id).toBe("doc-9");

    const noPerfObs: Observation = { resourceType: "Observation", status: "final", code: { text: "Event" }, component: [] };
    const parsedNoPerf = parseProcedureEventObservation(noPerfObs);
    expect(parsedNoPerf.by.id).toBe("unknown");
  });
});
