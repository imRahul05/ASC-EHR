import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { StaffMember } from "@asc/types";
import {
  bookCaseFormSchema,
  bookCaseInputFrom,
  type BookCaseFormData,
} from "@asc/validation/cases/book";
import { facilityDateTimeToIso } from "@asc/clinical-rules/time";
import { BookCaseForm } from "./book-case-sheet";
import { GI_CPT_PROCEDURE_OPTIONS } from "./schedule-options";

let mockFacilityId: string | null = "fac-metro";

const MOCK_STAFF: readonly StaffMember[] = [
  {
    id: "usr_surgeon_01",
    name: "Dr. Arthur Vance",
    initials: "AV",
    role: "SURGEON",
    title: "Attending Gastroenterologist",
    npi: "1093847261",
    active: true,
    email: "surgeon@ascehr.demo",
  },
  {
    id: "usr_anesthesia_01",
    name: "Dr. Elena Rostova",
    initials: "ER",
    role: "ANESTHESIOLOGIST",
    title: "Staff Anesthesiologist",
    npi: "1482910384",
    active: true,
    email: "anesthesia@ascehr.demo",
  },
];

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("../../hooks/use-active-facility", () => ({
  useActiveFacility: () => ({
    facilityId: mockFacilityId,
    facility: mockFacilityId ? { id: mockFacilityId, name: "Metro GI Center" } : null,
    hasFacility: mockFacilityId !== null,
  }),
}));

vi.mock("@asc/api-client/react", () => ({
  useBookCase: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useAdminOverview: () => ({
    data: { staff: MOCK_STAFF },
    isPending: false,
    isError: false,
  }),
  useReferral: () => ({
    data: null,
    isPending: false,
    isError: false,
  }),
  useSearchPatients: () => ({
    data: [],
    isPending: false,
  }),
  usePatient: () => ({
    data: {
      id: "pat-123",
      mrn: "MRN-12345",
      firstName: "Jane",
      lastName: "Doe",
      dateOfBirth: "1980-01-01",
      coverage: { eligibility: { status: "active" } },
    },
    isPending: false,
    isError: false,
  }),
}));

describe("BookCaseForm & BookCaseSheet", () => {
  it("renders booking form fields and selections", () => {
    const html = renderToStaticMarkup(
      <BookCaseForm
        staff={MOCK_STAFF}
        defaults={{
          patientId: "pat-123",
          roomId: "room-2",
          date: "2026-10-20",
          startTime: "09:00",
        }}
        referralHints={null}
        onDone={() => {}}
      />,
    );

    expect(html).toContain('data-testid="book-case-form"');
    expect(html).toContain('data-testid="book-case-patient-selected"');
    expect(html).toContain('data-testid="book-case-room"');
    expect(html).toContain('data-testid="book-case-intent"');
    expect(html).toContain('data-testid="book-case-procedure"');
    expect(html).toContain('data-testid="book-case-date"');
    expect(html).toContain('data-testid="book-case-start"');
    expect(html).toContain('data-testid="book-case-duration"');
    expect(html).toContain('data-testid="book-case-physician"');
    expect(html).toContain('data-testid="book-case-anesthesia"');
    expect(html).toContain('data-testid="book-case-notes"');
    expect(html).toContain('data-testid="book-case-submit"');

    // Physician populated by default; anesthesia select is present
    expect(html).toContain("Dr. Arthur Vance");
    expect(html).toContain('data-testid="book-case-anesthesia"');

    // Standard GI CPT default is rendered in the trigger
    expect(html).toContain("45378");
    expect(GI_CPT_PROCEDURE_OPTIONS.map((opt) => opt.value)).toContain("43239");
    expect(GI_CPT_PROCEDURE_OPTIONS.map((opt) => opt.value)).toContain("45385");
  });

  it("renders search input when no patient is preselected", () => {
    const html = renderToStaticMarkup(
      <BookCaseForm
        staff={MOCK_STAFF}
        defaults={{}}
        referralHints={null}
        onDone={() => {}}
      />,
    );
    expect(html).toContain('data-testid="book-case-patient-search"');
  });

  it("renders HTTP 409 conflict alert banner when a schedule collision occurs", () => {
    const conflictMessage = "Operating room room-2 is already booked during this time";
    const html = renderToStaticMarkup(
      <BookCaseForm
        staff={MOCK_STAFF}
        defaults={{
          patientId: "pat-123",
          roomId: "room-2",
          date: "2026-10-20",
          startTime: "09:00",
        }}
        referralHints={null}
        onDone={() => {}}
        initialConflict={conflictMessage}
      />,
    );

    expect(html).toContain('data-testid="book-case-conflict-alert"');
    expect(html).toContain("Scheduling Conflict (HTTP 409)");
    expect(html).toContain(conflictMessage);

    // Form inputs and selections are preserved and NOT wiped out on conflict
    expect(html).toContain('value="2026-10-20"');
    expect(html).toContain('value="09:00"');
    expect(html).toContain('data-testid="book-case-submit"');
  });

  it("converts form data into a valid BookCaseInput with UTC ISO timestamp", () => {
    const formData: BookCaseFormData = {
      facilityId: "fac-metro",
      patientId: "pat-999",
      roomId: "room-3",
      date: "2026-11-01",
      startTime: "10:30",
      durationMinutes: 60,
      procedureIntent: "therapeutic",
      primaryProcedureCode: "45385",
      primaryPhysicianId: "doc-vance",
      anesthesiologistId: "anes-rostova",
      notes: "Polypectomy planned for large sigmoid polyp.",
    };

    const parsed = bookCaseFormSchema.safeParse(formData);
    expect(parsed.success).toBe(true);

    const input = bookCaseInputFrom(formData);
    expect(input.facilityId).toBe("fac-metro");
    expect(input.patientId).toBe("pat-999");
    expect(input.roomId).toBe("room-3");
    expect(input.durationMinutes).toBe(60);
    expect(input.procedureIntent).toBe("therapeutic");
    expect(input.primaryProcedureCode).toBe("45385");
    expect(input.primaryPhysicianId).toBe("doc-vance");
    expect(input.anesthesiologistId).toBe("anes-rostova");
    expect(input.notes).toBe("Polypectomy planned for large sigmoid polyp.");
    expect(input.scheduledAt).toBe(facilityDateTimeToIso("2026-11-01", "10:30"));
  });

  it("renders warning banner and disables submit when no active facility is selected", () => {
    mockFacilityId = null;
    const html = renderToStaticMarkup(
      <BookCaseForm
        staff={MOCK_STAFF}
        defaults={{}}
        referralHints={null}
        onDone={() => {}}
      />,
    );
    expect(html).toContain('data-testid="book-case-no-facility-alert"');
    expect(html).toContain("No active facility selected");
    expect(html).toContain('disabled=""');
    mockFacilityId = "fac-metro";
  });

  it("propagates referralId and idempotencyKey through bookCaseInputFrom", () => {
    const formData: BookCaseFormData = {
      facilityId: "fac-metro",
      patientId: "pat-999",
      roomId: "room-3",
      date: "2026-11-01",
      startTime: "10:30",
      durationMinutes: 45,
      procedureIntent: "screening",
      primaryProcedureCode: "45378",
      primaryPhysicianId: "doc-vance",
      referralId: "ref-456",
      idempotencyKey: "test-idem-key-123",
    };

    const parsed = bookCaseFormSchema.safeParse(formData);
    expect(parsed.success).toBe(true);

    const input = bookCaseInputFrom(formData);
    expect(input.referralId).toBe("ref-456");
    expect(input.idempotencyKey).toBe("test-idem-key-123");
  });
});
