import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AnesthesiaRecord } from "@asc/types";
import { PreAnesthesiaCard } from "./pre-anesthesia-card";

vi.mock("@asc/api-client/react", () => ({
  usePreAnesthesiaAssessment: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

const baseRecord: AnesthesiaRecord = {
  caseId: "case-pre-101",
  provider: { id: "anes-1", name: "Dr. Anes", initials: "DA" },
  technique: "MAC",
  airway: { device: "nasal_cannula", o2Lpm: 2 },
  doses: [],
  vitals: [],
  airwayEvents: [],
  preAssessment: null,
};

describe("PreAnesthesiaCard", () => {
  it("renders input form when no pre-anesthesia assessment is recorded", () => {
    const html = renderToStaticMarkup(
      <PreAnesthesiaCard caseId="case-pre-101" record={baseRecord} editable={true} />,
    );

    expect(html).toContain("Pre-Anesthesia Medical Evaluation");
    expect(html).toContain("data-testid=\"pre-anesthesia-form-card\"");
    expect(html).toContain("ASA Physical Status");
    expect(html).toContain("Mallampati Classification");
    expect(html).toContain("NPO Status Satisfied");
    expect(html).toContain("data-testid=\"submit-pre-anesthesia-button\"");
  });

  it("renders verified clearance view when pre-anesthesia assessment exists", () => {
    const recordWithAssessment: AnesthesiaRecord = {
      ...baseRecord,
      preAssessment: {
        asaClass: 2,
        mallampati: 2,
        airwayNotes: "Dentition intact, Mallampati 2",
        lastOralIntakeIso: "2026-10-15T00:00:00Z",
        npoStatusSatisfied: true,
        assessedAt: "2026-10-15T07:45:00Z",
        assessedBy: { id: "anes-1", name: "Dr. Anes", initials: "DA" },
      },
    };

    const html = renderToStaticMarkup(
      <PreAnesthesiaCard caseId="case-pre-101" record={recordWithAssessment} editable={true} />,
    );

    expect(html).toContain("data-testid=\"pre-anesthesia-verified-card\"");
    expect(html).toContain("Evaluation Verified &amp; Cleared for Sedation");
    expect(html).toContain("ASA 2");
    expect(html).toContain("Class 2");
    expect(html).toContain("Satisfied (≥8h)");
    expect(html).toContain("Dentition intact, Mallampati 2");
    expect(html).toContain("Dr. Anes");
  });
});
