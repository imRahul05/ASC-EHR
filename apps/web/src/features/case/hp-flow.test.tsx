import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Medication } from "@asc/types";
import type * as AscUi from "@asc/ui";
import { HpOverrideModal } from "./components/hp-override-modal";
import { HpUpdateModal } from "./components/hp-update-modal";
import { MedicationHoldsCard } from "./pre-procedure/medication-holds-card";

vi.mock("@asc/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof AscUi>();
  return {
    ...actual,
    Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
      open ? <div data-slot="dialog">{children}</div> : null,
    DialogContent: ({ children, className, ...props }: React.ComponentProps<"div">) => (
      <div data-slot="dialog-content" className={className} {...props}>
        {children}
      </div>
    ),
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogClose: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Select: ({ children, value }: { children: React.ReactNode; value?: string }) => (
      <div data-slot="select" data-value={value}>{children}</div>
    ),
    SelectTrigger: ({ children, className, ...props }: React.ComponentProps<"button">) => (
      <button type="button" className={className} {...props}>{children}</button>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
      <div data-item-value={value}>{children}</div>
    ),
  };
});

vi.mock("@asc/api-client/react", () => ({
  useSubmitHpUpdateMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useSubmitHpOverrideMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useSubmitAnticoagulationMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useSaveHp: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

describe("H&P Flow and Anticoagulation Components", () => {
  describe("HpUpdateModal", () => {
    const defaultProps = {
      caseId: "case-hp-1",
      facilityId: "facility-main",
      patientName: "Margaret Atwood",
      hpDate: "2026-10-01",
      open: true,
      onOpenChange: vi.fn(),
    };

    it("renders day-of H&P interval update note fields with CMS § 416.52 context", () => {
      const html = renderToStaticMarkup(<HpUpdateModal {...defaultProps} />);

      expect(html).toContain("Day-of Pre-Procedure H&amp;P Interval Update Note");
      expect(html).toContain("CMS 42 CFR § 416.52");
      expect(html).toContain("Margaret Atwood");
      expect(html).toContain("2026-10-01");
      expect(html).toContain("data-testid=\"hp-update-modal\"");
      expect(html).toContain("data-testid=\"hp-cardio-input\"");
      expect(html).toContain("data-testid=\"hp-pulmonary-input\"");
      expect(html).toContain("data-testid=\"hp-airway-input\"");
      expect(html).toContain("data-testid=\"hp-practitioner-input\"");
      expect(html).toContain("data-testid=\"hp-attestation-textarea\"");
      expect(html).toContain("data-testid=\"hp-no-interval-change-checkbox\"");
      expect(html).toContain("data-testid=\"hp-update-submit-button\"");
    });
  });

  describe("HpOverrideModal", () => {
    const defaultProps = {
      caseId: "case-hp-2",
      facilityId: "facility-main",
      patientName: "George Orwell",
      open: true,
      onOpenChange: vi.fn(),
    };

    it("renders clinical override modal with role selection and justification textarea", () => {
      const html = renderToStaticMarkup(<HpOverrideModal {...defaultProps} />);

      expect(html).toContain("Clinical Override of Pre-Procedure H&amp;P");
      expect(html).toContain("Role-Restricted Clinical Override");
      expect(html).toContain("George Orwell");
      expect(html).toContain("data-testid=\"hp-override-modal\"");
      expect(html).toContain("data-testid=\"hp-override-role-select\"");
      expect(html).toContain("data-testid=\"hp-override-physician-input\"");
      expect(html).toContain("data-testid=\"hp-override-reason-textarea\"");
      expect(html).toContain("data-testid=\"hp-override-submit-button\"");
      expect(html).toContain("Authorize Clinical Override");
    });
  });

  describe("MedicationHoldsCard with Anticoagulation Section", () => {
    const mockAnticoagMed: Medication = {
      id: "med-apixaban",
      name: "Apixaban (Eliquis)",
      dose: "5 mg",
      frequency: "BID",
      medClass: "anticoagulant",
      holdRule: {
        daysBefore: 2,
        instruction: "Hold 48 hours prior to high-risk procedure per ASGE",
        source: "ASGE 2022",
      },
      holdStatus: "pending",
      lastTakenAt: "2026-10-14",
    };

    const mockRoutineMed: Medication = {
      id: "med-lisinopril",
      name: "Lisinopril",
      dose: "10 mg",
      frequency: "Daily",
      medClass: "other",
      holdRule: null,
      holdStatus: "not_required",
    };

    it("renders ASGE anticoagulation guidance table for anticoagulant medication", () => {
      const html = renderToStaticMarkup(
        <MedicationHoldsCard
          caseId="case-anticoag-1"
          medications={[mockAnticoagMed, mockRoutineMed]}
          scheduledStart="2026-10-15T08:00:00Z"
          holdsReviewed={false}
          locked={false}
        />,
      );

      expect(html).toContain("ASGE 2022 Anticoagulation &amp; Antiplatelet Clearance");
      expect(html).toContain("data-testid=\"asge-anticoag-section\"");
      expect(html).toContain("data-testid=\"asge-med-row-med-apixaban\"");
      expect(html).toContain("Apixaban (Eliquis)");
      expect(html).toContain("doac");
      expect(html).toContain("Hold DOAC for at least 48 hours");
      expect(html).toContain("data-testid=\"prescriber-date-med-apixaban\"");
      expect(html).toContain("data-testid=\"prescriber-instruction-med-apixaban\"");
      expect(html).toContain("data-testid=\"patient-confirmed-held-med-apixaban\"");
      expect(html).toContain("data-testid=\"submit-anticoagulation-button\"");
    });

    it("renders clear-no-anticoagulation option when no anticoagulants are on file", () => {
      const html = renderToStaticMarkup(
        <MedicationHoldsCard
          caseId="case-anticoag-2"
          medications={[mockRoutineMed]}
          scheduledStart="2026-10-15T08:00:00Z"
          holdsReviewed={false}
          locked={false}
        />,
      );

      expect(html).toContain("No active anticoagulants or antiplatelets detected");
      expect(html).toContain("data-testid=\"clear-no-anticoag-button\"");
      expect(html).toContain("Confirm No Anticoagulants (Gate 2 Clear)");
    });
  });
});
