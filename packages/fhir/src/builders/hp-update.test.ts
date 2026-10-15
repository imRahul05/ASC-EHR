import { describe, expect, it } from "vitest";
import { buildHpUpdateDocumentReference } from "./hp-update.js";
import { buildAnticoagulationObservation } from "./anticoagulation.js";

describe("buildHpUpdateDocumentReference", () => {
  it("builds a valid FHIR R4 DocumentReference with all optional fields", () => {
    const docRef = buildHpUpdateDocumentReference({
      id: "doc-123",
      facilityId: "fac-1",
      caseId: "case-100",
      patientId: "pat-200",
      practitionerId: "prac-300",
      practitionerName: "Dr. Roberts",
      attestation: "I have examined the patient today and confirm no interval change in cardiopulmonary status.",
      cardiovascularStatus: "Regular rate and rhythm",
      pulmonaryStatus: "Clear to auscultation",
      airwayStatus: "Mallampati I",
      signedAt: "2026-10-15T08:00:00Z",
    });

    expect(docRef.resourceType).toBe("DocumentReference");
    expect(docRef.id).toBe("doc-123");
    expect(docRef.status).toBe("current");
    expect(docRef.docStatus).toBe("final");
    expect(docRef.type?.coding?.[0]?.code).toBe("11506-3");
    expect(docRef.type?.coding?.[0]?.system).toBe("http://loinc.org");
    expect(docRef.subject?.reference).toBe("Patient/pat-200");
    expect(docRef.context?.encounter?.[0]?.reference).toBe("Encounter/case-100");
    expect(docRef.author?.[0]?.reference).toBe("Practitioner/prac-300");
    expect(docRef.meta?.accounts?.[0]?.reference).toBe("Organization/fac-1");
    expect(docRef.content).toHaveLength(1);
    expect(docRef.content[0]?.attachment?.contentType).toBe("text/plain");
  });

  it("builds a valid FHIR R4 DocumentReference with minimal fields", () => {
    const docRef = buildHpUpdateDocumentReference({
      facilityId: "fac-1",
      caseId: "case-100",
      patientId: "pat-200",
      attestation: "No interval change in patient cardiopulmonary or airway status.",
      cardiovascularStatus: "Normal",
      pulmonaryStatus: "Normal",
    });

    expect(docRef.resourceType).toBe("DocumentReference");
    expect(docRef.id).toBeUndefined();
    expect(docRef.author).toBeUndefined();
    expect(docRef.date).toBeDefined();
  });
});

describe("buildAnticoagulationObservation", () => {
  it("builds a valid FHIR R4 Observation with full recommendations and hold statuses", () => {
    const obs = buildAnticoagulationObservation({
      id: "obs-999",
      facilityId: "fac-1",
      caseId: "case-100",
      patientId: "pat-200",
      procedureBleedingRisk: "high",
      hasAnticoagulants: true,
      status: "satisfied",
      recommendations: [
        {
          medicationId: "med-1",
          medicationName: "Apixaban 5mg",
          drugClass: "doac",
          recommendedHoldHours: 48,
          recommendationText: "Hold for 48 hours prior to procedure",
          prescriberInstructionDate: "2026-10-10",
          prescriberInstruction: "Hold 48h",
          patientConfirmedHeld: true,
        },
        {
          medicationId: "med-2",
          medicationName: "Warfarin 5mg",
          drugClass: "warfarin",
          recommendedHoldHours: 120,
          recommendationText: "Hold 5 days",
          patientConfirmedHeld: false,
        },
        {
          medicationId: "med-3",
          medicationName: "Clopidogrel 75mg",
          drugClass: "p2y12",
          recommendedHoldHours: 120,
          recommendationText: "Hold 5-7 days",
          patientConfirmedHeld: null,
        },
      ],
      assessedAt: "2026-10-15T08:15:00Z",
      practitionerId: "prac-300",
    });

    expect(obs.resourceType).toBe("Observation");
    expect(obs.id).toBe("obs-999");
    expect(obs.status).toBe("final");
    expect(obs.code.coding?.[0]?.code).toBe("80585-3");
    expect(obs.subject?.reference).toBe("Patient/pat-200");
    expect(obs.encounter?.reference).toBe("Encounter/case-100");
    expect(obs.meta?.accounts?.[0]?.reference).toBe("Organization/fac-1");
    expect(obs.performer?.[0]?.reference).toBe("Practitioner/prac-300");
    expect(obs.component?.length).toBe(5);
  });

  it("builds a valid Observation with no anticoagulants and minimal inputs", () => {
    const obs = buildAnticoagulationObservation({
      facilityId: "fac-1",
      caseId: "case-100",
      patientId: "pat-200",
      procedureBleedingRisk: "low",
      hasAnticoagulants: false,
      status: "satisfied",
    });

    expect(obs.resourceType).toBe("Observation");
    expect(obs.id).toBeUndefined();
    expect(obs.performer).toBeUndefined();
    expect(obs.component?.length).toBe(2);
  });
});
