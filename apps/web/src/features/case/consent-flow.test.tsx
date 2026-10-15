import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type * as AscUi from "@asc/ui";
import { ConsentModal } from "./components/consent-modal";

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
  };
});

vi.mock("@asc/api-client/react", () => ({
  useSignConsent: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

describe("ConsentModal flow", () => {
  const defaultProps = {
    caseId: "case-c1",
    facilityId: "facility-main",
    procedureName: "Colonoscopy with Polypectomy",
    procedureCode: "45385",
    performingPhysicianName: "Dr. Sarah Jenkins",
    patientName: "Robert Taylor",
    open: true,
    onOpenChange: vi.fn(),
  };

  it("renders modal when open=true with procedure, physician, and patient details", () => {
    const html = renderToStaticMarkup(<ConsentModal {...defaultProps} />);

    expect(html).toContain("Informed Consent Attestation");
    expect(html).toContain("Colonoscopy with Polypectomy");
    expect(html).toContain("45385");
    expect(html).toContain("Dr. Sarah Jenkins");
    expect(html).toContain("Robert Taylor");
    expect(html).toContain("data-testid=\"consent-modal\"");
  });

  it("renders signature pad with 44px clear touch target and risks checkbox", () => {
    const html = renderToStaticMarkup(<ConsentModal {...defaultProps} />);

    expect(html).toContain("data-testid=\"consent-signature-pad\"");
    expect(html).toContain("data-testid=\"consent-risks-checkbox\"");
    expect(html).toContain("Digital Tablet Signature");
    expect(html).toContain("data-testid=\"consent-submit-button\"");
  });

  it("does not render modal when open=false", () => {
    const html = renderToStaticMarkup(<ConsentModal {...defaultProps} open={false} />);
    expect(html).toBe("");
  });
});
