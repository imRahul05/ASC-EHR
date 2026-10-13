import type {
  ReadinessCheck,
  ReadinessCheckName,
  ReadinessCheckStatus,
} from "@asc/types";
import type { CodeSystem, Extension, Observation } from "@medplum/fhirtypes";
import { facilityMeta, instant, reference } from "@asc/fhir/builders/common";
import { createExtensionUrls } from "@asc/fhir/extensions";
import { type FhirUrls, fhirUrls } from "@asc/fhir/urls";

export type {
  OverallReadiness,
  ReadinessCheck,
  ReadinessCheckName,
  ReadinessCheckStatus,
} from "@asc/types";

interface ReadinessCheckMetadata {
  readonly code: string;
  readonly display: string;
  readonly definition: string;
}

const READINESS_CHECKS: Readonly<Record<ReadinessCheckName, ReadinessCheckMetadata>> = {
  identity: {
    code: "identity",
    display: "Identity verification",
    definition: "Patient matched to a single record, DOB and name verified",
  },
  coverage: {
    code: "coverage",
    display: "Active eligibility",
    definition: "Active eligibility response on file, dated within 30 days of the procedure",
  },
  benefits: {
    code: "benefits",
    display: "Benefits capture",
    definition: "Deductible, coinsurance and out-of-pocket captured",
  },
  authorization: {
    code: "authorization",
    display: "Prior authorization",
    definition: "Auth on file and valid on the procedure date, or payer confirmed not required",
  },
  estimate: {
    code: "estimate",
    display: "Good faith estimate",
    definition: "Patient responsibility calculated and communicated",
  },
  consent: {
    code: "consent",
    display: "Informed consent",
    definition: "Signed consent naming this procedure and physician",
  },
  hp: {
    code: "hp",
    display: "History & physical",
    definition: "H&P within 30 days, plus pre-procedure update",
  },
  anticoagulation: {
    code: "anticoagulation",
    display: "Anticoagulation hold",
    definition: "Hold confirmed, or documented as not applicable",
  },
  anesthesia_clearance: {
    code: "anesthesia-clearance",
    display: "Anesthesia clearance",
    definition: "Pre-anaesthesia assessment complete, ASA assigned",
  },
  prep: {
    code: "prep",
    display: "Bowel preparation",
    definition: "Prep instructions delivered and patient confirmation obtained",
  },
  escort: {
    code: "escort",
    display: "Responsible escort",
    definition: "Responsible adult confirmed for discharge",
  },
  equipment: {
    code: "equipment",
    display: "Equipment readiness",
    definition: "Required scope and accessories available and reprocessed",
  },
};

export function readinessCheckCode(name: ReadinessCheckName): string {
  return READINESS_CHECKS[name].code;
}

export function readinessCheckDisplay(name: ReadinessCheckName): string {
  return READINESS_CHECKS[name].display;
}

export function readinessCheckDefinition(name: ReadinessCheckName): string {
  return READINESS_CHECKS[name].definition;
}

export function buildReadinessCheckCodeSystem(urls: FhirUrls = fhirUrls): CodeSystem {
  return {
    resourceType: "CodeSystem",
    url: urls.codeSystem("readiness-check"),
    name: "ReadinessCheck",
    title: "Readiness check",
    status: "active",
    content: "complete",
    caseSensitive: true,
    description: "The 12 computed clinical and administrative readiness checks for surgical clearance (REQ-5 §185–199).",
    concept: Object.values(READINESS_CHECKS).map(({ code, display, definition }) => ({
      code,
      display,
      definition,
    })),
  };
}

/**
 * Builds a FHIR complex extension representing a single ReadinessCheck on an Encounter.
 */
export function caseReadinessExtension(check: ReadinessCheck, urls: FhirUrls = fhirUrls): Extension {
  return {
    url: createExtensionUrls(urls).caseReadiness,
    extension: [
      { url: "name", valueCode: check.name },
      { url: "status", valueCode: check.status },
      { url: "label", valueString: check.label },
      ...(check.details !== undefined ? [{ url: "details", valueString: check.details }] : []),
      ...(check.waivedBy !== undefined ? [{ url: "waivedBy", valueString: check.waivedBy }] : []),
      ...(check.waivedAt !== undefined ? [{ url: "waivedAt", valueDateTime: instant(check.waivedAt, "waivedAt") }] : []),
      ...(check.waiverReason !== undefined ? [{ url: "waiverReason", valueString: check.waiverReason }] : []),
    ],
  };
}

/**
 * Builds FHIR complex extensions for an array of ReadinessChecks.
 */
export function caseReadinessExtensions(checks: readonly ReadinessCheck[], urls: FhirUrls = fhirUrls): Extension[] {
  return checks.map((check) => caseReadinessExtension(check, urls));
}

function isValidCheckName(name: string): name is ReadinessCheckName {
  return Object.hasOwn(READINESS_CHECKS, name);
}

function isValidCheckStatus(status: string): status is ReadinessCheckStatus {
  return status === "satisfied" || status === "pending" || status === "failed" || status === "waived";
}

/**
 * Parses ReadinessChecks from an Encounter's extensions.
 */
export function readCaseReadiness(
  extensions: readonly Extension[] | undefined,
  urls: FhirUrls = fhirUrls,
): readonly ReadinessCheck[] {
  if (!extensions) return [];
  const targetUrl = createExtensionUrls(urls).caseReadiness;
  const results: ReadinessCheck[] = [];

  for (const ext of extensions) {
    if (ext.url !== targetUrl || !ext.extension) continue;
    let name: ReadinessCheckName | undefined;
    let status: ReadinessCheckStatus | undefined;
    let label: string | undefined;
    let details: string | undefined;
    let waivedBy: string | undefined;
    let waivedAt: string | undefined;
    let waiverReason: string | undefined;

    for (const sub of ext.extension) {
      if (sub.url === "name" && sub.valueCode && isValidCheckName(sub.valueCode)) {
        name = sub.valueCode;
      } else if (sub.url === "status" && sub.valueCode && isValidCheckStatus(sub.valueCode)) {
        status = sub.valueCode;
      } else if (sub.url === "label" && sub.valueString) {
        label = sub.valueString;
      } else if (sub.url === "details" && sub.valueString) {
        details = sub.valueString;
      } else if (sub.url === "waivedBy" && sub.valueString) {
        waivedBy = sub.valueString;
      } else if (sub.url === "waivedAt" && sub.valueDateTime) {
        waivedAt = sub.valueDateTime;
      } else if (sub.url === "waiverReason" && sub.valueString) {
        waiverReason = sub.valueString;
      }
    }

    if (name !== undefined && status !== undefined && label !== undefined) {
      results.push({
        name,
        status,
        label,
        ...(details !== undefined ? { details } : {}),
        ...(waivedBy !== undefined ? { waivedBy } : {}),
        ...(waivedAt !== undefined ? { waivedAt } : {}),
        ...(waiverReason !== undefined ? { waiverReason } : {}),
      });
    }
  }

  return results;
}

export interface ReadinessObservationInput {
  readonly facilityId: string;
  readonly encounterId: string;
  readonly patientId: string;
  readonly check: ReadinessCheck;
  readonly effectiveDateTime?: string;
}

/**
 * Builds a FHIR Observation resource representing a single ReadinessCheck linked to an Encounter.
 */
export function buildReadinessObservation(
  input: ReadinessObservationInput,
  urls: FhirUrls = fhirUrls,
): Observation {
  return {
    resourceType: "Observation",
    meta: facilityMeta(input.facilityId),
    status: "final",
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
            code: "exam",
            display: "Exam",
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: urls.codeSystem("readiness-check"),
          code: readinessCheckCode(input.check.name),
          display: input.check.label,
        },
      ],
    },
    subject: reference("Patient", input.patientId, "patient id"),
    encounter: reference("Encounter", input.encounterId, "encounter id"),
    effectiveDateTime: input.effectiveDateTime
      ? instant(input.effectiveDateTime, "effectiveDateTime")
      : input.check.waivedAt
        ? instant(input.check.waivedAt, "waivedAt")
        : "2026-10-12T00:00:00Z",
    valueCodeableConcept: {
      coding: [
        {
          system: urls.codeSystem("readiness-status"),
          code: input.check.status,
          display: input.check.status,
        },
      ],
    },
    ...(input.check.details !== undefined ? { note: [{ text: input.check.details }] } : {}),
  };
}
