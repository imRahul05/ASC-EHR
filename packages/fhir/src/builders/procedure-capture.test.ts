import { describe, expect, it } from "vitest";
import type { Observation } from "@medplum/fhirtypes";
import type {
  Gate2OverrideRecord,
  ProcedureEvent,
  ScopeAssignmentRecord,
  StaffRef,
  TimeOutChecklist,
  TimeOutParticipant,
} from "@asc/types";

import {
  buildGate2OverrideObservation,
  buildProcedureEventObservation,
  buildScopeVerificationObservation,
  buildSurgicalTimeOutObservation,
  buildWithdrawalTimeObservation,
  parseGate2OverrideObservation,
  parseProcedureEventObservation,
  parseScopeVerificationObservation,
  parseSurgicalTimeOutObservation,
  parseWithdrawalTimeObservation,
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
    expect(parsed.attestations[3]?.role).toBe("TECH");
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

  it("attaches aimsClientIdIdentifier when clientId is passed", () => {
    const obs = buildProcedureEventObservation({ facilityId, caseId, patientId, event, clientId: "client-procedure-uuid-1" });
    expect(obs.identifier).toBeDefined();
    expect(obs.identifier?.[0]?.value).toBe("client-procedure-uuid-1");
  });
});

describe("withdrawal time observation", () => {
  it("builds and parses withdrawal observation meeting quality benchmark", () => {
    const obs = buildWithdrawalTimeObservation({
      facilityId, caseId, patientId, withdrawalTimeMinutes: 7.5, meetsQualityBenchmark: true,
      recordedAt: "2026-09-20T08:45:00Z", performerId: "u-doc", id: "wt-obs-1",
    });
    expect(obs.id).toBe("wt-obs-1");
    expect(obs.code?.coding?.[0]?.code).toBe(LOINC_CODES.WITHDRAWAL_TIME);
    expect(obs.valueQuantity?.value).toBe(7.5);
    expect(obs.performer?.[0]?.reference).toBe("Practitioner/u-doc");

    const parsed = parseWithdrawalTimeObservation(obs);
    expect(parsed.withdrawalTimeMinutes).toBe(7.5);
    expect(parsed.meetsQualityBenchmark).toBe(true);
  });

  it("builds withdrawal observation without optional id, performer, or timestamp and handles fallback parsing", () => {
    const obs = buildWithdrawalTimeObservation({
      facilityId, caseId, patientId, withdrawalTimeMinutes: 4.2, meetsQualityBenchmark: false,
    });
    expect(obs.id).toBeUndefined();
    expect(obs.performer).toBeUndefined();
    expect(obs.effectiveDateTime).toBeDefined();

    const parsed = parseWithdrawalTimeObservation(obs);
    expect(parsed.withdrawalTimeMinutes).toBe(4.2);
    expect(parsed.meetsQualityBenchmark).toBe(false);

    const emptyParsed = parseWithdrawalTimeObservation({ resourceType: "Observation", status: "final", code: { text: "WT" } });
    expect(emptyParsed.withdrawalTimeMinutes).toBe(0);
    expect(emptyParsed.meetsQualityBenchmark).toBe(false);
  });
});

describe("scope verification observation", () => {
  const assignedBy: StaffRef = { id: "u-tech", name: "Bob Tech", initials: "BT" };
  const scopeAssignment: ScopeAssignmentRecord = {
    scopeSerial: "CF-Q180AL-12345", scopeModel: "Olympus CF-Q180AL",
    reprocessedAt: "2026-09-20T06:00:00Z", assignedAt: "2026-09-20T08:00:00Z",
    assignedBy, leakTestResult: "PASS", cycleOutcome: "PASS",
    hangTimeHours: 2.0, withinHangTimeWindow: true, fhirObservationId: "scope-obs-1",
  };

  it("builds and parses scope verification with model and explicit id", () => {
    const obs = buildScopeVerificationObservation({ facilityId, caseId, patientId, scopeAssignment, id: "scope-obs-custom" });
    expect(obs.id).toBe("scope-obs-custom");
    expect(obs.code?.coding?.[0]?.code).toBe(LOINC_CODES.SCOPE_VERIFICATION);
    expect(obs.valueString).toBe("CF-Q180AL-12345");

    const parsed = parseScopeVerificationObservation(obs);
    expect(parsed.scopeSerial).toBe("CF-Q180AL-12345");
    expect(parsed.scopeModel).toBe("Olympus CF-Q180AL");
    expect(parsed.leakTestResult).toBe("PASS");
    expect(parsed.cycleOutcome).toBe("PASS");
    expect(parsed.hangTimeHours).toBe(2.0);
    expect(parsed.withinHangTimeWindow).toBe(true);
    expect(parsed.assignedBy.name).toBe("Bob Tech");
  });

  it("builds and parses scope verification without model and uses fallback id", () => {
    const assignmentWithoutModel: ScopeAssignmentRecord = {
      ...scopeAssignment, scopeModel: undefined, leakTestResult: "FAIL", cycleOutcome: "FAIL",
      withinHangTimeWindow: false, hangTimeHours: 172.5, fhirObservationId: undefined,
    };
    const obs = buildScopeVerificationObservation({ facilityId, caseId, patientId, scopeAssignment: assignmentWithoutModel });
    expect(obs.id).toBeUndefined();
    const parsed = parseScopeVerificationObservation(obs);
    expect(parsed.scopeModel).toBeUndefined();
    expect(parsed.leakTestResult).toBe("FAIL");
    expect(parsed.cycleOutcome).toBe("FAIL");
    expect(parsed.withinHangTimeWindow).toBe(false);
    expect(parsed.hangTimeHours).toBe(172.5);

    const emptyObs: Observation = {
      resourceType: "Observation", status: "final", code: { text: "Scope" },
      performer: [{ reference: "Practitioner/tech-5" }],
      component: [{ code: { coding: [{ code: "assignedBy" }] }, valueString: "{bad json" }, { code: { coding: [{ code: "unrecognized" }] } }],
    };
    const emptyParsed = parseScopeVerificationObservation(emptyObs);
    expect(emptyParsed.scopeSerial).toBe("");
    expect(emptyParsed.assignedBy.id).toBe("tech-5");

    const noCompParsed = parseScopeVerificationObservation({ resourceType: "Observation", status: "final", code: { text: "Scope" } });
    expect(noCompParsed.assignedBy.id).toBe("unknown");

    const emptyValObs: Observation = {
      resourceType: "Observation", status: "final", code: { text: "Scope" },
      component: [
        { code: { coding: [{ code: "serial" }] } },
        { code: { coding: [{ code: "model" }] } },
        { code: { coding: [{ code: "reprocessedAt" }] } },
        { code: { coding: [{ code: "hangTimeHours" }] } },
        { code: { coding: [{ code: "withinHangTimeWindow" }] } },
        { code: { coding: [{ code: "assignedBy" }] } },
      ],
    };
    const emptyValParsed = parseScopeVerificationObservation(emptyValObs);
    expect(emptyValParsed.scopeSerial).toBe("");
  });
});

describe("gate 2 override observation", () => {
  const override: Gate2OverrideRecord = {
    overriddenAt: "2026-09-20T08:10:00Z", actorId: "u-physician", actorName: "Dr. Gregory House",
    actorRole: "gi-physician", reason: "Emergency diagnostic colonoscopy for active GI bleed",
    overriddenBlockers: ["PREP_INADEQUATE"], fhirObservationId: "g2-obs-1",
  };

  it("builds and parses Gate 2 override observation with explicit id", () => {
    const obs = buildGate2OverrideObservation({ facilityId, caseId, patientId, override, id: "g2-obs-custom" });
    expect(obs.id).toBe("g2-obs-custom");
    expect(obs.code?.coding?.[0]?.code).toBe(LOINC_CODES.GATE2_OVERRIDE);
    expect(obs.valueString).toBe(override.reason);

    const parsed = parseGate2OverrideObservation(obs);
    expect(parsed.actorId).toBe("u-physician");
    expect(parsed.actorName).toBe("Dr. Gregory House");
    expect(parsed.actorRole).toBe("gi-physician");
    expect(parsed.reason).toBe(override.reason);
    expect(parsed.overriddenBlockers).toEqual(["PREP_INADEQUATE"]);
  });

  it("builds Gate 2 override with fallback id and handles fallback parsing", () => {
    const overrideNoId: Gate2OverrideRecord = { ...override, fhirObservationId: undefined };
    const obs = buildGate2OverrideObservation({ facilityId, caseId, patientId, override: overrideNoId });
    expect(obs.id).toBeUndefined();

    const emptyObs: Observation = {
      resourceType: "Observation", status: "final", code: { text: "Override" },
      performer: [{ reference: "Practitioner/user-9" }],
      component: [
        { code: { coding: [{ code: "actor" }] }, valueString: "{bad json" },
        { code: { coding: [{ code: "blockers" }] }, valueString: "{bad json" },
        { code: { coding: [{ code: "unrecognized" }] } },
      ],
    };
    const emptyParsed = parseGate2OverrideObservation(emptyObs);
    expect(emptyParsed.actorId).toBe("user-9");
    expect(emptyParsed.overriddenBlockers).toEqual([]);

    const noCompParsed = parseGate2OverrideObservation({ resourceType: "Observation", status: "final", code: { text: "Override" } });
    expect(noCompParsed.actorId).toBe("");

    const emptyValG2Obs: Observation = {
      resourceType: "Observation", status: "final", code: { text: "Override" },
      component: [
        { code: { coding: [{ code: "actor" }] } },
        { code: { coding: [{ code: "reason" }] } },
        { code: { coding: [{ code: "blockers" }] } },
      ],
    };
    const emptyValG2Parsed = parseGate2OverrideObservation(emptyValG2Obs);
    expect(emptyValG2Parsed.reason).toBe("");
  });
});
