import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DuplicateMatchDialog } from "./duplicate-match-dialog";

vi.mock("@asc/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@asc/ui")>();
  return {
    ...actual,
    Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
      open ? <div data-slot="dialog">{children}</div> : null,
    DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-slot="dialog-content" className={className}>
        {children}
      </div>
    ),
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

vi.mock("@asc/api-client/react", () => ({
  usePatient: () => ({
    data: {
      id: "p-existing",
      mrn: "MRN-EXISTING",
      firstName: "Jane",
      lastName: "Doe",
      dateOfBirth: "1985-05-15",
      sex: "F",
      phone: "(555) 000-1111",
      address: {
        line: "123 Old St",
        city: "Townsville",
        state: "NY",
        postalCode: "10002",
      },
    },
    isPending: false,
    isError: false,
  }),
}));

describe("DuplicateMatchDialog", () => {
  const baseSubmittedData = {
    firstName: "Jane",
    lastName: "Doe",
    dateOfBirth: "1985-05-15",
    gender: "female",
    phone: "(555) 123-4567",
    mrn: "MRN-9999",
    address: {
      line: ["456 New St"],
      city: "Cityville",
      state: "CA",
      postalCode: "90210",
      country: "USA",
    },
  };

  it("renders exact MRN conflict mode with red alert and locked waiver button", () => {
    const html = renderToStaticMarkup(
      <DuplicateMatchDialog
        open={true}
        onOpenChange={() => undefined}
        conflictCode="duplicate_mrn_conflict"
        duplicateMatch={{
          hasMatch: true,
          highestConfidence: "exact_identifier",
          matches: [
            {
              patientId: "p-existing",
              confidence: "exact_identifier",
              score: 1.0,
              reasons: ["Exact MRN match: MRN-9999"],
            },
          ],
        }}
        submittedData={baseSubmittedData}
      />,
    );

    expect(html).toContain("Exact MRN Conflict");
    expect(html).toContain('data-testid="duplicate-mrn-alert"');
    expect(html).toContain("Duplicate MRNs within the same facility are strictly prohibited");
    expect(html).toContain("The override waiver is not permitted for exact MRN collisions");
    expect(html).toContain('data-testid="duplicate-register-anyway-disabled"');
    expect(html).toContain("disabled");
  });

  it("renders demographic duplicate mode with amber alert and enabled confirm button", () => {
    const html = renderToStaticMarkup(
      <DuplicateMatchDialog
        open={true}
        onOpenChange={() => undefined}
        conflictCode="duplicate_patient_detected"
        duplicateMatch={{
          hasMatch: true,
          highestConfidence: "high",
          matches: [
            {
              patientId: "p-existing",
              confidence: "high",
              score: 0.9,
              reasons: ["Matching first name, last name, and date of birth"],
            },
          ],
        }}
        submittedData={baseSubmittedData}
      />,
    );

    expect(html).toContain("Potential Duplicate Patient Detected");
    expect(html).toContain('data-testid="duplicate-demographic-alert"');
    expect(html).toContain("Submitted Intake Data");
    expect(html).toContain("Existing Patient Chart");
    expect(html).toContain('data-testid="duplicate-confirm-register-anyway"');
    expect(html).toContain("Confirm and Register Anyway");
  });
});
