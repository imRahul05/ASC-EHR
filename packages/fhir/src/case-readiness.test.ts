import type { ReadinessCheck, ReadinessCheckName } from "@asc/types";
import { describe, expect, it } from "vitest";
import {
  buildReadinessCheckCodeSystem,
  buildReadinessObservation,
  caseReadinessExtension,
  caseReadinessExtensions,
  readCaseReadiness,
  readinessCheckCode,
  readinessCheckDefinition,
  readinessCheckDisplay,
} from "./case-readiness.js";
import { createFhirUrls } from "./urls.js";

const CHECKS: readonly ReadinessCheckName[] = [
  "identity",
  "coverage",
  "benefits",
  "authorization",
  "estimate",
  "consent",
  "hp",
  "anticoagulation",
  "anesthesia_clearance",
  "prep",
  "escort",
  "equipment",
];

describe("readiness check codes and definitions", () => {
  it("defines all 12 checks with display, code, and definitions", () => {
    for (const name of CHECKS) {
      expect(readinessCheckCode(name).length).toBeGreaterThan(0);
      expect(readinessCheckDisplay(name).length).toBeGreaterThan(0);
      expect(readinessCheckDefinition(name).length).toBeGreaterThan(0);
    }
  });

  it("builds the readiness-check CodeSystem", () => {
    const system = buildReadinessCheckCodeSystem();
    expect(system).toMatchObject({
      resourceType: "CodeSystem",
      url: "https://fhir.wybit.io/asc/CodeSystem/readiness-check",
      name: "ReadinessCheck",
      title: "Readiness check",
      status: "active",
      content: "complete",
    });
    expect(system.concept?.map((c) => c.code)).toHaveLength(12);
  });
});

describe("caseReadinessExtension and readCaseReadiness", () => {
  it("serializes and deserializes readiness checks completely", () => {
    const checks: ReadinessCheck[] = [
      {
        name: "identity",
        status: "satisfied",
        label: "Photo ID and DOB verified",
      },
      {
        name: "authorization",
        status: "waived",
        label: "Prior authorization on file",
        details: "Payer confirmed not required for diagnostic procedure",
        waivedBy: "practitioner-123",
        waivedAt: "2026-10-12T09:00:00Z",
        waiverReason: "Payer written confirmation on file",
      },
      {
        name: "anticoagulation",
        status: "failed",
        label: "Hold confirmed",
        details: "Eliquis not held required 48 hours",
      },
    ];

    const extensions = caseReadinessExtensions(checks);
    expect(extensions).toHaveLength(3);

    const parsed = readCaseReadiness(extensions);
    expect(parsed).toEqual(checks);
  });

  it("handles edge cases: undefined extensions, empty extensions, and unmatched URLs", () => {
    expect(readCaseReadiness(undefined)).toEqual([]);
    expect(readCaseReadiness([])).toEqual([]);
    expect(readCaseReadiness([{ url: "https://fhir.wybit.io/asc/StructureDefinition/other" }])).toEqual([]);
    expect(
      readCaseReadiness([
        {
          url: "https://fhir.wybit.io/asc/StructureDefinition/case-readiness",
          extension: [{ url: "name", valueCode: "invalid-check" }],
        },
      ]),
    ).toEqual([]);
  });

  it("uses custom canonical URLs", () => {
    const urls = createFhirUrls("https://custom.fhir.org/asc/");
    const check: ReadinessCheck = {
      name: "consent",
      status: "satisfied",
      label: "Consent signed",
    };
    const ext = caseReadinessExtension(check, urls);
    expect(ext.url).toBe("https://custom.fhir.org/asc/StructureDefinition/case-readiness");
    expect(readCaseReadiness([ext], urls)).toEqual([check]);
  });
});

describe("buildReadinessObservation", () => {
  it("builds a FHIR Observation representing a readiness check", () => {
    const check: ReadinessCheck = {
      name: "hp",
      status: "satisfied",
      label: "H&P completed within 30 days",
      details: "Completed by referring GI on Oct 5",
    };

    const obs = buildReadinessObservation({
      facilityId: "fac-1",
      encounterId: "enc-1",
      patientId: "pat-1",
      check,
      effectiveDateTime: "2026-10-12T10:00:00Z",
    });

    expect(obs).toMatchObject({
      resourceType: "Observation",
      status: "final",
      category: [{ coding: [{ code: "exam" }] }],
      code: {
        coding: [{ system: "https://fhir.wybit.io/asc/CodeSystem/readiness-check", code: "hp", display: "H&P completed within 30 days" }],
      },
      subject: { reference: "Patient/pat-1" },
      encounter: { reference: "Encounter/enc-1" },
      effectiveDateTime: "2026-10-12T10:00:00Z",
      valueCodeableConcept: {
        coding: [{ system: "https://fhir.wybit.io/asc/CodeSystem/readiness-status", code: "satisfied" }],
      },
      note: [{ text: "Completed by referring GI on Oct 5" }],
    });
  });

  it("falls back to waivedAt or default date when effectiveDateTime is not provided", () => {
    const waivedCheck: ReadinessCheck = {
      name: "equipment",
      status: "waived",
      label: "Scope reprocessed",
      waivedAt: "2026-10-12T08:30:00Z",
    };
    const obsWaived = buildReadinessObservation({
      facilityId: "fac-1",
      encounterId: "enc-1",
      patientId: "pat-1",
      check: waivedCheck,
    });
    expect(obsWaived.effectiveDateTime).toBe("2026-10-12T08:30:00Z");

    const pendingCheck: ReadinessCheck = {
      name: "equipment",
      status: "pending",
      label: "Scope reprocessed",
    };
    const obsPending = buildReadinessObservation({
      facilityId: "fac-1",
      encounterId: "enc-1",
      patientId: "pat-1",
      check: pendingCheck,
    });
    expect(obsPending.effectiveDateTime).toBe("2026-10-12T00:00:00Z");
  });
});
