import { describe, expect, it } from "vitest";
import { buildConsentResource, sha256Hex } from "./consent.js";
import { buildPreopObservationsBundle, buildPreopObservations } from "./preop.js";

const VALID_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAABaCAYAAAA7W3NRAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAGVSURBVHhe7dsxEcAwDMCwhz95r0mBh7cUM4oAC3C815z37e9z1uW1r1r7er/z2d/nrMsr3wI=";

describe("sha256Hex", () => {
  it("calculates correct standard SHA-256 digests", () => {
    // Standard test vectors
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("hello")).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    // UTF-8 multi-byte characters: code < 2048 (é) and code >= 2048 (€)
    expect(sha256Hex("café €")).toBe("e66baa599b628bfeacdf904db6d22eb50d9feaadb2947a689b1ef83707a1d4f2");
  });
});

describe("buildConsentResource", () => {
  it("builds an active treatment Consent resource with cryptographic signature hash extension", () => {
    const consent = buildConsentResource({
      facilityId: "fac-1",
      patientId: "pat-1",
      caseId: "case-1",
      procedureName: "Colonoscopy with Polypectomy",
      procedureCode: "45385",
      performingPhysicianName: "Dr. Jane Corwin",
      signerName: "John Doe",
      signerRelationship: "patient",
      signatureDataUrl: VALID_PNG_DATA_URL,
      consentFormVersion: "v1.0",
      dateTime: "2026-10-15T08:00:00Z",
    });

    expect(consent.resourceType).toBe("Consent");
    expect(consent.status).toBe("active");
    expect(consent.scope).toEqual({
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/consentscope",
          code: "treatment",
          display: "Treatment",
        },
      ],
    });
    expect(consent.category).toEqual([
      {
        coding: [
          {
            system: "http://loinc.org",
            code: "59284-0",
            display: "Consent Document",
          },
        ],
      },
    ]);
    expect(consent.patient).toEqual({ reference: "Patient/pat-1" });
    expect(consent.meta).toEqual({ accounts: [{ reference: "Organization/fac-1" }] });
    expect(consent.dateTime).toBe("2026-10-15T08:00:00Z");

    const expectedHash = sha256Hex(VALID_PNG_DATA_URL);
    const hashExt = consent.extension?.find(
      (ext) => ext.url === "https://fhir.wybit.io/asc/StructureDefinition/signature-hash",
    );
    expect(hashExt?.valueString).toBe(expectedHash);

    const procCodeExt = consent.extension?.find(
      (ext) => ext.url === "https://fhir.wybit.io/asc/StructureDefinition/procedure-code",
    );
    expect(procCodeExt?.valueString).toBe("45385");

    const caseRefExt = consent.extension?.find(
      (ext) => ext.url === "https://fhir.wybit.io/asc/StructureDefinition/case-reference",
    );
    expect(caseRefExt?.valueReference).toEqual({ reference: "Encounter/case-1" });
  });

  it("accepts custom signatureHash and defaults dateTime when omitted", () => {
    const consent = buildConsentResource({
      facilityId: "fac-1",
      patientId: "pat-1",
      caseId: "case-1",
      procedureName: "EGD",
      procedureCode: "43239",
      performingPhysicianName: "Dr. Jane Corwin",
      signerName: "John Doe",
      signerRelationship: "patient",
      signatureDataUrl: VALID_PNG_DATA_URL,
      signatureHash: "custom-hash-123",
      consentFormVersion: "v1.0",
    });

    expect(consent.dateTime).toBeDefined();
    const hashExt = consent.extension?.find(
      (ext) => ext.url === "https://fhir.wybit.io/asc/StructureDefinition/signature-hash",
    );
    expect(hashExt?.valueString).toBe("custom-hash-123");
  });
});

describe("buildPreopObservationsBundle & buildPreopObservations", () => {
  const vitalsInput = {
    facilityId: "fac-1",
    patientId: "pat-1",
    caseId: "case-1",
    recordedAt: "2026-10-15T08:15:00Z",
    performerId: "prac-1",
    vitals: {
      sbp: 120,
      dbp: 80,
      hr: 70,
      rr: 16,
      spo2: 98,
      tempC: 36.6,
      heightInches: 70,
      weightLbs: 175,
    },
  };

  it("builds discrete LOINC-coded vital signs observations with performer and optional height/weight", () => {
    const observations = buildPreopObservations(vitalsInput);
    expect(observations).toHaveLength(8);

    const sbp = observations.find((obs) => obs.code.coding?.[0]?.code === "8480-6");
    expect(sbp).toBeDefined();
    expect(sbp?.valueQuantity?.value).toBe(120);
    expect(sbp?.valueQuantity?.unit).toBe("mmHg");
    expect(sbp?.subject).toEqual({ reference: "Patient/pat-1" });
    expect(sbp?.encounter).toEqual({ reference: "Encounter/case-1" });
    expect(sbp?.meta).toEqual({ accounts: [{ reference: "Organization/fac-1" }] });
    expect(sbp?.performer).toEqual([{ reference: "Practitioner/prac-1" }]);

    const temp = observations.find((obs) => obs.code.coding?.[0]?.code === "8310-5");
    expect(temp).toBeDefined();
    expect(temp?.valueQuantity?.value).toBe(36.6);
    expect(temp?.valueQuantity?.unit).toBe("Cel");

    const height = observations.find((obs) => obs.code.coding?.[0]?.code === "8302-2");
    expect(height?.valueQuantity?.value).toBe(70);

    const weight = observations.find((obs) => obs.code.coding?.[0]?.code === "29463-7");
    expect(weight?.valueQuantity?.value).toBe(175);
  });

  it("defaults recordedAt when omitted", () => {
    const { recordedAt: _, ...withoutRecordedAt } = vitalsInput;
    const observations = buildPreopObservations(withoutRecordedAt);
    expect(observations[0]?.effectiveDateTime).toBeDefined();
  });

  it("omits optional vitals when undefined", () => {
    const minimalVitals = {
      facilityId: "fac-1",
      patientId: "pat-1",
      caseId: "case-1",
      vitals: {
        sbp: 120,
        dbp: 80,
        hr: 70,
        rr: 16,
        spo2: 98,
        tempC: 36.6,
      },
    };
    const observations = buildPreopObservations(minimalVitals);
    expect(observations).toHaveLength(6);
    expect(observations.find((obs) => obs.code.coding?.[0]?.code === "8302-2")).toBeUndefined();
  });

  it("builds a transaction bundle for pre-op vitals observations", () => {
    const bundle = buildPreopObservationsBundle(vitalsInput);
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("transaction");
    expect(bundle.entry?.length).toBe(8);
  });
});
