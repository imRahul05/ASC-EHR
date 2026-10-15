import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as AscUi from "@asc/ui";
import { PreopIntakeDrawer } from "./components/preop-intake-drawer";

vi.mock("@asc/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof AscUi>();
  return {
    ...actual,
    Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
      open ? <div data-slot="sheet">{children}</div> : null,
    SheetContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-slot="sheet-content" className={className}>
        {children}
      </div>
    ),
    SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    SheetFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SheetClose: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

vi.mock("@asc/api-client/react", () => ({
  useSubmitPreopAssessment: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

describe("PreopIntakeDrawer flow", () => {
  const defaultProps = {
    caseId: "case-p17",
    facilityId: "facility-main",
    patientName: "Eleanor Vance",
    defaultEscort: {
      name: "Hugh Crain",
      relationship: "spouse",
      phone: "555-0144",
    },
    open: true,
    onOpenChange: vi.fn(),
  };

  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        for (const key of Object.keys(mockStorage)) {
          delete mockStorage[key];
        }
      },
    });
  });

  it("renders pre-op bay assessment fields with vitals, IV, NPO, and escort verification", () => {
    const html = renderToStaticMarkup(<PreopIntakeDrawer {...defaultProps} />);

    expect(html).toContain("Pre-Op Bay Nursing Assessment");
    expect(html).toContain("Eleanor Vance");
    expect(html).toContain("data-testid=\"preop-vitals-sbp\"");
    expect(html).toContain("data-testid=\"preop-vitals-dbp\"");
    expect(html).toContain("data-testid=\"preop-vitals-hr\"");
    expect(html).toContain("data-testid=\"preop-vitals-spo2\"");
    expect(html).toContain("data-testid=\"preop-vitals-temp\"");
    expect(html).toContain("data-testid=\"preop-iv-site-select\"");
    expect(html).toContain("data-testid=\"preop-iv-gauge-select\"");
    expect(html).toContain("data-testid=\"preop-npo-solids\"");
    expect(html).toContain("data-testid=\"preop-npo-liquids\"");
    expect(html).toContain("data-testid=\"preop-escort-name\"");
    expect(html).toContain("data-testid=\"preop-escort-present-checkbox\"");
    expect(html).toContain("data-testid=\"preop-allergies-checkbox\"");
    expect(html).toContain("data-testid=\"preop-belongings-checkbox\"");
  });

  it("renders NPO violation warning when solid food < 6 hours or clear liquids < 2 hours", () => {
    // Populate sessionStorage with an NPO violation draft
    mockStorage["asc-preop-draft-case-p17"] = JSON.stringify({
      sbp: "120",
      dbp: "80",
      hr: "72",
      rr: "16",
      spo2: "99",
      tempC: "36.8",
      ivSite: "right_forearm",
      ivGauge: 20,
      ivAttempts: "1",
      solidFoodHoursAgo: "4", // Violation: < 6 hours
      clearLiquidsHoursAgo: "1", // Violation: < 2 hours
      npoConfirmed: true,
      escortName: "Hugh Crain",
      escortRelationship: "spouse",
      escortPhone: "555-0144",
      escortConfirmedPresent: true,
      allergiesReviewed: true,
      belongingsSecured: true,
    });

    const html = renderToStaticMarkup(<PreopIntakeDrawer {...defaultProps} />);

    expect(html).toContain("data-testid=\"npo-violation-alert\"");
    expect(html).toContain("NPO Guideline Warning");
    expect(html).toContain("4h");
    expect(html).toContain("1h");
  });

  it("restores work-in-progress draft from sessionStorage across unmount/remount (AC-F-03-4, NFR-14)", () => {
    mockStorage["asc-preop-draft-case-p17"] = JSON.stringify({
      sbp: "142",
      dbp: "88",
      hr: "85",
      rr: "18",
      spo2: "97",
      tempC: "37.2",
      ivSite: "left_hand",
      ivGauge: 18,
      ivAttempts: "2",
      solidFoodHoursAgo: "12",
      clearLiquidsHoursAgo: "4",
      npoConfirmed: true,
      escortName: "Hugh Crain (Restored)",
      escortRelationship: "husband",
      escortPhone: "555-9999",
      escortConfirmedPresent: true,
      allergiesReviewed: true,
      belongingsSecured: true,
    });

    const html = renderToStaticMarkup(<PreopIntakeDrawer {...defaultProps} />);

    expect(html).toContain("value=\"142\"");
    expect(html).toContain("value=\"88\"");
    expect(html).toContain("value=\"Hugh Crain (Restored)\"");
  });
});
