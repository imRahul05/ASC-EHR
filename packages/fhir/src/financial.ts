/**
 * FHIR R4 Financial Clearance Resource Builders
 *
 * Implements pure FHIR R4 builders for:
 * 1. CoverageEligibilityRequest: HIPAA X12 270 Real-time eligibility inquiries.
 * 2. CoverageEligibilityResponse: HIPAA X12 271 Benefits inquiry responses.
 * 3. Financial Readiness Observation: Financial checks on Encounter (coverage, benefits, authorization, estimate).
 * 4. Encounter Financial Extension: Case-level financial clearance summary.
 *
 * US Healthcare Regulations:
 * - HIPAA ANSI ASC X12 270/271: Standards for eligibility inquiry and response.
 * - HIPAA ANSI ASC X12 278: Standards for prior authorization and health care services review.
 * - ACA 42 U.S.C. § 300gg-13: Preventive service cost-sharing mandates.
 * - No Surprises Act 45 CFR § 149: Requirements for good-faith estimates and cost transparency.
 *
 * All financial amounts are integer cents (e.g. 50000 = $500.00).
 */

import type {
  CoverageEligibilityRequest,
  CoverageEligibilityResponse,
  CoverageEligibilityResponseInsuranceItem,
  CoverageEligibilityResponseInsuranceItemBenefit,
  Extension,
  Observation,
} from "@medplum/fhirtypes";
import { facilityMeta, isoDate, reference } from "@asc/fhir/builders/common";
import { buildReadinessObservation, readinessCheckDisplay } from "@asc/fhir/case-readiness";
import { createExtensionUrls } from "@asc/fhir/extensions";
import { type FhirUrls, fhirUrls } from "@asc/fhir/urls";

export interface CoverageEligibilityRequestParams {
  readonly facilityId: string;
  readonly patientId: string;
  readonly coverageId: string;
  readonly servicedDate: string;
  readonly purpose?: readonly ("auth-requirements" | "benefits" | "discovery" | "validation")[];
  readonly insurerId?: string;
}

/**
 * Builds a FHIR R4 CoverageEligibilityRequest resource for a 270 real-time inquiry.
 */
export function buildCoverageEligibilityRequest(
  params: CoverageEligibilityRequestParams
): CoverageEligibilityRequest {
  const servicedDateClean = isoDate(params.servicedDate.slice(0, 10), "servicedDate");

  return {
    resourceType: "CoverageEligibilityRequest",
    meta: facilityMeta(params.facilityId),
    status: "active",
    purpose: params.purpose ? [...params.purpose] : ["benefits", "validation"],
    patient: reference("Patient", params.patientId, "patient id"),
    servicedDate: servicedDateClean,
    created: new Date().toISOString(),
    insurer: reference(
      "Organization",
      params.insurerId ?? params.facilityId,
      "insurer id"
    ),
    insurance: [
      {
        coverage: reference("Coverage", params.coverageId, "coverage id"),
      },
    ],
  };
}

export interface CoverageEligibilityResponseParams {
  readonly facilityId: string;
  readonly patientId: string;
  readonly coverageId: string;
  readonly requestId?: string;
  readonly insurerId?: string;
  readonly status: "active" | "cancelled" | "draft" | "entered-in-error";
  readonly outcome: "queued" | "complete" | "error" | "partial";
  readonly disposition?: string;
  readonly servicedDate?: string;
  readonly inforce: boolean;
  readonly benefitPeriod?: { readonly start: string; readonly end?: string };
  readonly benefits?: {
    readonly individualDeductibleCents?: number;
    readonly individualDeductibleRemainingCents?: number;
    readonly copayCents?: number;
    readonly coinsurancePercent?: number;
    readonly outOfPocketMaxCents?: number;
    readonly outOfPocketRemainingCents?: number;
    readonly inNetwork?: boolean;
    readonly serviceTypeCode?: string;
  };
  readonly rawPayload?: Record<string, string | number | boolean | null>;
  readonly created?: string;
}

/**
 * Builds a FHIR R4 CoverageEligibilityResponse resource representing parsed X12 271 benefits.
 * Retains raw payload in XHTML narrative for auditability per AC-D-01-3.
 */
export function buildCoverageEligibilityResponse(
  params: CoverageEligibilityResponseParams
): CoverageEligibilityResponse {
  const benefits = params.benefits;
  const items: CoverageEligibilityResponseInsuranceItem[] = [];

  if (benefits) {
    const serviceCode = benefits.serviceTypeCode ?? "30";
    const categoryDisplay =
      serviceCode === "33"
        ? "Chiropractic / Endoscopy"
        : "Health Benefit Plan Coverage";

    const benefitList: CoverageEligibilityResponseInsuranceItemBenefit[] = [];

    if (benefits.individualDeductibleCents !== undefined) {
      const allowed = benefits.individualDeductibleCents / 100;
      const used =
        benefits.individualDeductibleRemainingCents !== undefined
          ? (benefits.individualDeductibleCents - benefits.individualDeductibleRemainingCents) / 100
          : 0;

      benefitList.push({
        type: {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/benefit-type",
              code: "deductible",
              display: "Deductible",
            },
          ],
        },
        allowedMoney: {
          value: allowed,
          currency: "USD",
        },
        usedMoney: {
          value: used,
          currency: "USD",
        },
      });
    }

    if (benefits.copayCents !== undefined) {
      benefitList.push({
        type: {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/benefit-type",
              code: "copay",
              display: "Copayment",
            },
          ],
        },
        allowedMoney: {
          value: benefits.copayCents / 100,
          currency: "USD",
        },
      });
    }

    if (benefits.coinsurancePercent !== undefined) {
      benefitList.push({
        type: {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/benefit-type",
              code: "coinsurance",
              display: "Coinsurance",
            },
          ],
        },
        allowedUnsignedInt: Math.round(benefits.coinsurancePercent),
      });
    }

    if (benefits.outOfPocketMaxCents !== undefined) {
      const allowed = benefits.outOfPocketMaxCents / 100;
      const used =
        benefits.outOfPocketRemainingCents !== undefined
          ? (benefits.outOfPocketMaxCents - benefits.outOfPocketRemainingCents) / 100
          : 0;

      benefitList.push({
        type: {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/benefit-type",
              code: "benefit",
              display: "Out of Pocket Maximum",
            },
          ],
        },
        allowedMoney: {
          value: allowed,
          currency: "USD",
        },
        usedMoney: {
          value: used,
          currency: "USD",
        },
      });
    }

    items.push({
      category: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/ex-benefitcategory",
            code: serviceCode,
            display: categoryDisplay,
          },
        ],
      },
      network: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/benefit-network",
            code: benefits.inNetwork ? "in" : "out",
            display: benefits.inNetwork ? "In Network" : "Out of Network",
          },
        ],
      },
      benefit: benefitList,
    });
  }

  const rawJson = params.rawPayload
    ? JSON.stringify(params.rawPayload, null, 2).replace(/[<>&]/g, (c) => `&#${c.charCodeAt(0)};`)
    : "";

  return {
    resourceType: "CoverageEligibilityResponse",
    meta: facilityMeta(params.facilityId),
    status: params.status,
    purpose: ["benefits", "validation"],
    patient: reference("Patient", params.patientId, "patient id"),
    servicedDate: params.servicedDate ? isoDate(params.servicedDate.slice(0, 10), "servicedDate") : undefined,
    created: params.created ?? new Date().toISOString(),
    request: params.requestId
      ? reference("CoverageEligibilityRequest", params.requestId, "request id")
      : { display: "Direct clearinghouse real-time inquiry" },
    outcome: params.outcome,
    disposition: params.disposition,
    insurer: reference(
      "Organization",
      params.insurerId ?? params.facilityId,
      "insurer id"
    ),
    insurance: [
      {
        coverage: reference("Coverage", params.coverageId, "coverage id"),
        inforce: params.inforce,
        benefitPeriod: params.benefitPeriod
          ? {
              start: isoDate(params.benefitPeriod.start.slice(0, 10), "benefitPeriod.start"),
              end: params.benefitPeriod.end ? isoDate(params.benefitPeriod.end.slice(0, 10), "benefitPeriod.end") : undefined,
            }
          : undefined,
        item: items.length > 0 ? items : undefined,
      },
    ],
    text: params.rawPayload
      ? {
          status: "generated",
          div: `<div xmlns="http://www.w3.org/1999/xhtml"><pre>${rawJson}</pre></div>`,
        }
      : undefined,
  };
}

export interface FinancialReadinessParams {
  readonly facilityId: string;
  readonly patientId: string;
  readonly encounterId: string;
  readonly checkName: "coverage" | "benefits" | "authorization" | "estimate";
  readonly status: "satisfied" | "pending" | "failed" | "waived";
  readonly details?: string;
  readonly effectiveDateTime?: string;
}

/**
 * Builds an Observation resource representing a financial readiness check linked to an Encounter.
 */
export function buildFinancialReadinessObservation(
  params: FinancialReadinessParams,
  urls: FhirUrls = fhirUrls
): Observation {
  return buildReadinessObservation(
    {
      facilityId: params.facilityId,
      patientId: params.patientId,
      encounterId: params.encounterId,
      check: {
        name: params.checkName,
        status: params.status,
        label: readinessCheckDisplay(params.checkName),
        ...(params.details !== undefined ? { details: params.details } : {}),
      },
      effectiveDateTime: params.effectiveDateTime,
    },
    urls
  );
}

export interface FinancialExtensionParams {
  readonly eligibilityStatus: string;
  readonly estimatedPatientOwedCents: number;
  readonly collectedCents?: number;
  readonly priorAuthNumber?: string;
  readonly priorAuthStatus?: string;
  readonly paymentPlanActive?: boolean;
}

/**
 * Builds a case financial summary extension for Encounter resources.
 */
export function caseFinancialExtension(
  params: FinancialExtensionParams,
  urls: FhirUrls = fhirUrls
): Extension {
  return {
    url: createExtensionUrls(urls).caseFinancial,
    extension: [
      { url: "eligibilityStatus", valueString: params.eligibilityStatus },
      { url: "estimatedPatientOwedCents", valueInteger: params.estimatedPatientOwedCents },
      ...(params.collectedCents !== undefined
        ? [{ url: "collectedCents", valueInteger: params.collectedCents }]
        : []),
      ...(params.priorAuthNumber !== undefined
        ? [{ url: "priorAuthNumber", valueString: params.priorAuthNumber }]
        : []),
      ...(params.priorAuthStatus !== undefined
        ? [{ url: "priorAuthStatus", valueString: params.priorAuthStatus }]
        : []),
      ...(params.paymentPlanActive !== undefined
        ? [{ url: "paymentPlanActive", valueBoolean: params.paymentPlanActive }]
        : []),
    ],
  };
}
