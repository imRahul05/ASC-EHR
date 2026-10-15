/**
 * Mock Clearinghouse Adapter
 *
 * Provides deterministic ANSI ASC X12 271 eligibility responses for local development,
 * testing, and simulation of edge-case payer adjudication behaviors:
 * 1. Active in-network PPO coverage with endoscopy benefit levels (service type 33).
 * 2. Incomplete 271 responses lacking endoscopy benefit codes (Review Focus #1).
 * 3. Terminated / inactive coverage (Review Focus #4).
 * 4. Payer error / timeout responses.
 *
 * Strict Integer Cents:
 * All monetary amounts are represented in integer cents to ensure parity with domain engines.
 */

import type { ClearinghouseAdapter, ClearinghouseInquiryParams } from "@asc/types";
import type { EligibilityResponse } from "@asc/validation";

export class MockClearinghouseAdapter implements ClearinghouseAdapter {
  async checkEligibility(params: ClearinghouseInquiryParams): Promise<EligibilityResponse> {
    await Promise.resolve();
    const memberUpper = params.memberId.toUpperCase();
    const nowIso = new Date().toISOString();

    if (memberUpper.includes("INCOMPLETE")) {
      return {
        status: "incomplete",
        planName: "Commercial Health Plan (Incomplete Response)",
        planType: "PPO",
        effectiveDate: "2026-01-01",
        subscriberRelationship: "self",
        inNetwork: true,
        individualDeductibleCents: 0,
        individualDeductibleRemainingCents: 0,
        copayCents: 0,
        coinsurancePercent: 0,
        outOfPocketMaxCents: 0,
        outOfPocketRemainingCents: 0,
        rawPayload: {
          note: "Payer returned general plan coverage but omitted specific GI endoscopy (33) benefits",
          serviceType: "30",
        },
        checkedAt: nowIso,
      };
    }

    if (memberUpper.includes("INACTIVE")) {
      return {
        status: "inactive",
        planName: "Terminated Health Plan",
        planType: "EPO",
        effectiveDate: "2025-01-01",
        terminationDate: "2026-09-30",
        subscriberRelationship: "self",
        inNetwork: false,
        individualDeductibleCents: 0,
        individualDeductibleRemainingCents: 0,
        copayCents: 0,
        coinsurancePercent: 0,
        outOfPocketMaxCents: 0,
        outOfPocketRemainingCents: 0,
        rawPayload: {
          eb01: "6", // Inactive
          note: "Coverage terminated at month boundary",
        },
        checkedAt: nowIso,
      };
    }

    if (memberUpper.includes("ERROR")) {
      return {
        status: "error",
        planName: "Unknown Plan",
        planType: "Unknown",
        effectiveDate: "2026-01-01",
        subscriberRelationship: "self",
        inNetwork: false,
        individualDeductibleCents: 0,
        individualDeductibleRemainingCents: 0,
        copayCents: 0,
        coinsurancePercent: 0,
        outOfPocketMaxCents: 0,
        outOfPocketRemainingCents: 0,
        rawPayload: {
          error: "AAA: Payer system timeout (X12 271)",
        },
        checkedAt: nowIso,
      };
    }

    // Default: Active in-network coverage with GI endoscopy benefits
    return {
      status: "active",
      planName: "Aetna Choice POS II",
      planType: "PPO",
      effectiveDate: "2026-01-01",
      terminationDate: "2026-12-31",
      subscriberRelationship: "self",
      inNetwork: true,
      individualDeductibleCents: 150000,
      individualDeductibleRemainingCents: 50000,
      familyDeductibleCents: 300000,
      familyDeductibleRemainingCents: 100000,
      copayCents: 0,
      coinsurancePercent: 20,
      outOfPocketMaxCents: 500000,
      outOfPocketRemainingCents: 250000,
      rawPayload: {
        eb01: "1", // Active
        serviceType: params.serviceTypeCode ?? "33",
        payerName: "Aetna",
      },
      checkedAt: nowIso,
    };
  }
}
