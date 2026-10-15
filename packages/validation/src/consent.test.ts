import { describe, expect, it } from "vitest";
import { signConsentSchema, type SignConsentInput } from "./consent.js";

const VALID_PNG_SIGNATURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAABaCAYAAAA7W3NRAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAGVSURBVHhe7dsxEcAwDMCwhz95r0mBh7cUM4oAC3C815z37e9z1uW1r1r7er/z2d/nrMsr3wI=";

// 1x1 transparent PNG data URL
const TRANSPARENT_1X1_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const validConsentPayload: SignConsentInput = {
  caseId: "case-123",
  procedureName: "Colonoscopy with Polypectomy",
  procedureCode: "45385",
  performingPhysicianName: "Dr. Jane Corwin",
  signerName: "John Doe",
  signerRelationship: "patient",
  signatureDataUrl: VALID_PNG_SIGNATURE,
  consentFormVersion: "v1.0",
  risksAcknowledged: true,
  facilityId: "facility-main",
};

describe("signConsentSchema", () => {
  it("accepts valid informed consent payload", () => {
    const result = signConsentSchema.safeParse(validConsentPayload);
    expect(result.success).toBe(true);
  });

  it("rejects empty signatureDataUrl", () => {
    const result = signConsentSchema.safeParse({
      ...validConsentPayload,
      signatureDataUrl: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/signature is required/i);
    }
  });

  it("rejects bare data URL without base64 content", () => {
    const result = signConsentSchema.safeParse({
      ...validConsentPayload,
      signatureDataUrl: "data:image/png;base64,",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/signature is required/i);
    }
  });

  it("rejects purely transparent 1x1 PNG signature", () => {
    const result = signConsentSchema.safeParse({
      ...validConsentPayload,
      signatureDataUrl: TRANSPARENT_1X1_PNG,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/signature is required/i);
    }
  });

  it("rejects non-PNG data URLs", () => {
    const result = signConsentSchema.safeParse({
      ...validConsentPayload,
      signatureDataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when risksAcknowledged is false or missing", () => {
    const resultFalse = signConsentSchema.safeParse({
      ...validConsentPayload,
      risksAcknowledged: false,
    });
    expect(resultFalse.success).toBe(false);

    const { risksAcknowledged: _, ...missingRisks } = validConsentPayload;
    const resultMissing = signConsentSchema.safeParse(missingRisks);
    expect(resultMissing.success).toBe(false);
  });

  it("rejects invalid signer relationship", () => {
    const result = signConsentSchema.safeParse({
      ...validConsentPayload,
      signerRelationship: "friend",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid facilityId or caseId format", () => {
    const result = signConsentSchema.safeParse({
      ...validConsentPayload,
      caseId: "",
    });
    expect(result.success).toBe(false);
  });
});
