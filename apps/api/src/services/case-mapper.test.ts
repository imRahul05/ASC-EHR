import { describe, expect, it } from "vitest";
import {
  buildPatientFromFhir,
  buildProcedureCaseFromFhir,
  computeAge,
  extractPatientInitials,
  extractPractitionerStaffRef,
  formatCanonicalCaseNumber,
  procedureCodeAndLabel,
  resolveCasePhase,
  resolveCaseStage,
  resolveTransitionTarget,
} from "./case-mapper.js";

describe("case-mapper", () => {
  describe("computeAge", () => {
    it("returns 0 for missing or invalid dates", () => {
      expect(computeAge(undefined)).toBe(0);
      expect(computeAge("")).toBe(0);
      expect(computeAge("invalid")).toBe(0);
    });
    it("computes approximate age", () => {
      expect(computeAge("2000-01-01")).toBeGreaterThanOrEqual(24);
    });
    it("handles ISO date strings and malformed formats gracefully", () => {
      expect(computeAge("1990-06-15T00:00:00.000Z")).toBeGreaterThanOrEqual(30);
      expect(computeAge("bad-date")).toBe(0);
    });
  });

  describe("extractPatientInitials", () => {
    it("extracts from given and family name", () => {
      expect(extractPatientInitials("John", "Doe")).toBe("J.D.");
    });
    it("falls back to display name", () => {
      expect(extractPatientInitials(undefined, undefined, "Jane Smith")).toBe("J.S.");
    });
    it("handles single-name / mononym patient without dropping known initial", () => {
      expect(extractPatientInitials("Cher", undefined, "Cher")).toBe("C.H.");
      expect(extractPatientInitials(undefined, "Madonna", "Madonna")).toBe("M.A.");
      expect(extractPatientInitials("Cher", undefined, undefined)).toBe("C.T.");
      expect(extractPatientInitials(undefined, "Madonna", undefined)).toBe("P.M.");
    });
    it("defaults to P.T. when empty", () => {
      expect(extractPatientInitials(undefined, undefined, undefined)).toBe("P.T.");
    });
  });

  describe("extractPractitionerStaffRef", () => {
    it("strips Doctor prefixes and calculates initials", () => {
      const ref = extractPractitionerStaffRef("Dr. Alice Walker", "Practitioner/doc-1");
      expect(ref.id).toBe("doc-1");
      expect(ref.name).toBe("Dr. Alice Walker");
      expect(ref.initials).toBe("AW");
    });
  });

  describe("resolveCasePhase & resolveCaseStage", () => {
    it("defaults to SCHEDULED when encounter is undefined", () => {
      expect(resolveCasePhase(undefined)).toBe("SCHEDULED");
      expect(resolveCaseStage(undefined)).toBeUndefined();
    });
    it("resolves from encounter status when no extension present", () => {
      expect(
        resolveCasePhase({
          resourceType: "Encounter",
          status: "in-progress",
          class: { code: "AMB" },
        }),
      ).toBe("IN_PROCEDURE");
    });
  });

  describe("formatCanonicalCaseNumber", () => {
    it("prefixes CASE- if not present", () => {
      expect(formatCanonicalCaseNumber("12345")).toBe("CASE-12345");
      expect(formatCanonicalCaseNumber("CASE-12345")).toBe("CASE-12345");
    });
  });

  describe("procedureCodeAndLabel", () => {
    it("identifies procedures correctly", () => {
      expect(procedureCodeAndLabel("EGD and Colonoscopy screening").code).toBe("EGD_COLONOSCOPY");
      expect(procedureCodeAndLabel("Upper endoscopy EGD 43235").code).toBe("EGD");
      expect(procedureCodeAndLabel("Diagnostic Flex Sig").code).toBe("FLEX_SIG");
      expect(procedureCodeAndLabel("Routine lower endoscopy").code).toBe("COLONOSCOPY");
    });
  });

  describe("buildPatientFromFhir & buildProcedureCaseFromFhir", () => {
    it("builds domain Patient and ProcedureCase", () => {
      const fhirPat = {
        resourceType: "Patient" as const,
        id: "pat-123",
        name: [{ given: ["Bob"], family: "Builder" }],
        birthDate: "1975-05-15",
        gender: "male" as const,
      };

      const patient = buildPatientFromFhir(fhirPat);
      expect(patient.id).toBe("pat-123");
      expect(patient.firstName).toBe("Bob");
      expect(patient.lastName).toBe("Builder");
      expect(patient.sex).toBe("M");

      const procCase = buildProcedureCaseFromFhir({
        encounter: { resourceType: "Encounter", id: "enc-456", status: "planned", class: { code: "AMB" } },
        fhirPatient: fhirPat,
      });

      expect(procCase.id).toBe("enc-456");
      expect(procCase.patient.displayName).toBe("Bob Builder");
      expect(procCase.phase).toBe("SCHEDULED");
    });

    it("handles anomalous appointment times by defaulting to 45 min duration", () => {
      const procCase = buildProcedureCaseFromFhir({
        appItem: {
          resourceType: "Appointment",
          status: "booked",
          participant: [{ status: "accepted" }],
          start: "2026-10-14T10:00:00.000Z",
          end: "2026-10-14T09:00:00.000Z", // end before start
        },
      });
      expect(procCase.durationMin).toBe(45);
    });
  });

  describe("resolveTransitionTarget", () => {
    it("resolves CaseStage target with matching CasePhase", () => {
      const res = resolveTransitionTarget("preop");
      expect(res.matchedStage).toBe("preop");
      expect(res.matchedPhase).toBe("PRE_OP");
    });

    it("resolves in_room stage with READY_FOR_PROCEDURE phase", () => {
      const res = resolveTransitionTarget("in_room");
      expect(res.matchedStage).toBe("in_room");
      expect(res.matchedPhase).toBe("READY_FOR_PROCEDURE");
    });

    it("resolves legacy CasePhase enum target with matching CaseStage", () => {
      const res = resolveTransitionTarget("PRE_OP");
      expect(res.matchedStage).toBe("preop");
      expect(res.matchedPhase).toBe("PRE_OP");
    });

    it("resolves legacy stored code target with matching CaseStage and Phase", () => {
      const res = resolveTransitionTarget("pre-op");
      expect(res.matchedStage).toBe("preop");
      expect(res.matchedPhase).toBe("PRE_OP");
    });

    it("returns undefined for unknown target strings", () => {
      const res = resolveTransitionTarget("completely_invalid");
      expect(res.matchedStage).toBeUndefined();
      expect(res.matchedPhase).toBeUndefined();
    });
  });
});
