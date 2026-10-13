import { describe, expect, it } from "vitest";
import { createFhirUrls } from "../urls.js";
import { buildServiceRequest, CPT_CODE_SYSTEM, type ServiceRequestInput } from "./service-request.js";

const base: ServiceRequestInput = {
  facilityId: "fac-1",
  patientId: "pat-1",
  procedureIntent: "screening",
  primaryProcedureCode: "45378",
};

describe("buildServiceRequest", () => {
  it("builds a minimal valid ServiceRequest for a screening procedure", () => {
    const sr = buildServiceRequest(base);
    expect(sr).toEqual({
      resourceType: "ServiceRequest",
      meta: { accounts: [{ reference: "Organization/fac-1" }] },
      status: "active",
      intent: "order",
      extension: [
        {
          url: "https://fhir.wybit.io/asc/StructureDefinition/procedure-intent",
          valueCoding: {
            system: "https://fhir.wybit.io/asc/CodeSystem/procedure-intent",
            code: "screening",
          },
        },
      ],
      code: {
        coding: [{ system: CPT_CODE_SYSTEM, code: "45378" }],
        text: "45378",
      },
      subject: { reference: "Patient/pat-1" },
    });
  });

  it("builds a full ServiceRequest with secondary codes, encounter, requester, notes, and authoredOn", () => {
    const fullInput: ServiceRequestInput = {
      ...base,
      procedureIntent: "diagnostic",
      primaryProcedureCode: "43239",
      secondaryProcedureCodes: ["45380", "45385"],
      encounterId: "enc-1",
      requesterId: "doc-1",
      notes: "Follow-up endoscopy for dysphagia.",
      authoredOn: "2026-10-14T08:00:00Z",
    };

    const sr = buildServiceRequest(fullInput);
    expect(sr.encounter).toEqual({ reference: "Encounter/enc-1" });
    expect(sr.requester).toEqual({ reference: "Practitioner/doc-1" });
    expect(sr.authoredOn).toBe("2026-10-14T08:00:00Z");
    expect(sr.note).toEqual([{ text: "Follow-up endoscopy for dysphagia." }]);
    expect(sr.code?.coding).toEqual([
      { system: CPT_CODE_SYSTEM, code: "43239" },
      { system: CPT_CODE_SYSTEM, code: "45380" },
      { system: CPT_CODE_SYSTEM, code: "45385" },
    ]);

    const multiline = buildServiceRequest({
      ...base,
      notes: "Screening colonoscopy.\nSedation required.",
    });
    expect(multiline.note?.[0]?.text).toBe("Screening colonoscopy.\nSedation required.");
  });

  it("supports custom FHIR canonical base URLs", () => {
    const customUrls = createFhirUrls("https://custom.test/fhir/");
    const sr = buildServiceRequest(base, customUrls);
    expect(sr.extension?.[0]?.url).toBe("https://custom.test/fhir/StructureDefinition/procedure-intent");
    expect(sr.extension?.[0]?.valueCoding?.system).toBe("https://custom.test/fhir/CodeSystem/procedure-intent");
  });

  it("rejects invalid inputs without echoing sensitive fields", () => {
    expect(() => buildServiceRequest({ ...base, facilityId: "" })).toThrow("invalid facility id");
    expect(() => buildServiceRequest({ ...base, facilityId: "bad/fac" })).toThrow("invalid facility id");
    expect(() => buildServiceRequest({ ...base, patientId: "" })).toThrow("invalid patient id");
    expect(() => buildServiceRequest({ ...base, patientId: "bad pat" })).toThrow("invalid patient id");
    expect(() => buildServiceRequest({ ...base, procedureIntent: "invalid" as ServiceRequestInput["procedureIntent"] })).toThrow("invalid procedure intent");
    expect(() => buildServiceRequest({ ...base, primaryProcedureCode: "" })).toThrow("invalid primary procedure code");
    expect(() => buildServiceRequest({ ...base, primaryProcedureCode: "a".repeat(33) })).toThrow("invalid primary procedure code");
    expect(() => buildServiceRequest({ ...base, secondaryProcedureCodes: [""] })).toThrow("invalid secondary procedure code");
    expect(() => buildServiceRequest({ ...base, encounterId: "bad enc" })).toThrow("invalid encounter id");
    expect(() => buildServiceRequest({ ...base, requesterId: "bad doc" })).toThrow("invalid requester id");
    expect(() => buildServiceRequest({ ...base, authoredOn: "invalid-time" })).toThrow("invalid authored on");
    expect(() => buildServiceRequest({ ...base, notes: "   " })).toThrow("invalid service request notes");
    expect(() => buildServiceRequest({ ...base, notes: "x".repeat(501) })).toThrow("invalid service request notes");
  });
});
