import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FinancialSummary } from "@asc/types";
import { FinancialClearanceCard } from "./financial-clearance-card";

// Mock @asc/api-client/react
const mockSummary: FinancialSummary = {
  caseId: "case-101",
  eligibilityStatus: "active",
  planName: "Aetna Choice POS II",
  planType: "PPO",
  inNetwork: true,
  deductibleCents: 150000,
  deductibleRemainingCents: 50000,
  copayCents: 0,
  coinsurancePercent: 20,
  outOfPocketMaxCents: 500000,
  outOfPocketRemainingCents: 250000,
  priorAuthStatus: "approved",
  authNumber: "AUTH-88219",
  estimate: {
    estimatedScreeningPatientOwedCents: 0,
    estimatedTherapeuticPatientOwedCents: 35000,
    patientResponsibilityCents: 0,
    preventiveMandateApplies: true,
  },
  collectedCents: 0,
  balanceRemainingCents: 0,
  hasPaymentPlan: false,
  overallStatus: "satisfied",
  isCleared: true,
};

let currentSummary: FinancialSummary | undefined = mockSummary;
let isPendingSummary = false;

vi.mock("@asc/api-client/react", () => ({
  useFinancialSummary: () => ({
    data: currentSummary,
    isPending: isPendingSummary,
    isError: false,
    refetch: vi.fn(),
  }),
  useCaseEligibilityCheck: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useCollectCopay: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useRecordPriorAuth: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

describe("FinancialClearanceCard", () => {
  it("renders active coverage with in-network badge and deductible breakdown", () => {
    currentSummary = mockSummary;
    isPendingSummary = false;

    const html = renderToStaticMarkup(<FinancialClearanceCard caseId="case-101" />);

    expect(html).toContain("Financial Clearance &amp; Benefits");
    expect(html).toContain("Aetna Choice POS II");
    expect(html).toContain("In-Network");
    expect(html).toContain("$500.00"); // $500 remaining deductible
    expect(html).toContain("$2,500.00"); // $2500 remaining OOP max
    expect(html).toContain("data-testid=\"financial-clearance-card\"");
  });

  it("renders dual Good-Faith Estimate under ACA § 300gg-13 and No Surprises Act", () => {
    currentSummary = mockSummary;
    isPendingSummary = false;

    const html = renderToStaticMarkup(<FinancialClearanceCard caseId="case-101" />);

    // Preventive screening: $0
    expect(html).toContain("Screening Colonoscopy (Preventive)");
    expect(html).toContain("$0.00");
    expect(html).toContain("ACA 42 U.S.C. § 300gg-13");

    // Therapeutic polyp resection: $350.00
    expect(html).toContain("Therapeutic Resection Contingency");
    expect(html).toContain("$350.00");
    expect(html).toContain("Modifier 33 / PT");
  });

  it("renders prior authorization approved badge and auth number", () => {
    currentSummary = mockSummary;
    isPendingSummary = false;

    const html = renderToStaticMarkup(<FinancialClearanceCard caseId="case-101" />);

    expect(html).toContain("AUTH-88219");
    expect(html).toContain("data-testid=\"prior-auth-badge-approved\"");
  });

  it("renders 44px min-h-11 action buttons for recheck and copay collection", () => {
    currentSummary = mockSummary;
    isPendingSummary = false;

    const html = renderToStaticMarkup(<FinancialClearanceCard caseId="case-101" />);

    expect(html).toContain("data-testid=\"recheck-eligibility-button\"");
    expect(html).toContain("data-testid=\"collect-copay-button\"");
    expect(html).toContain("min-h-11");
  });

  it("renders degraded response warning when coverage response is incomplete (Review Focus #1)", () => {
    currentSummary = {
      ...mockSummary,
      eligibilityStatus: "incomplete",
      overallStatus: "pending",
      isCleared: false,
    };
    isPendingSummary = false;

    const html = renderToStaticMarkup(<FinancialClearanceCard caseId="case-101" />);

    expect(html).toContain("Incomplete 271 Benefit Response");
    expect(html).toContain("data-testid=\"degraded-eligibility-alert\"");
  });
});
