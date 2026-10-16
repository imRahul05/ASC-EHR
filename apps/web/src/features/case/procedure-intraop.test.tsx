import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CaseDetail } from "@asc/types";
import { Gate2OverrideBar } from "./procedure/gate2-override-bar";
import { ScopeAssignmentCard } from "./procedure/scope-assignment-card";
import { TimeOutPanel } from "./procedure/time-out-panel";

vi.mock("@asc/api-client/react", () => ({
  useAssignScope: () => ({ mutate: vi.fn(), isPending: false }),
  useOverrideGate2: () => ({ mutate: vi.fn(), isPending: false }),
  useAttestTimeOut: () => ({ mutate: vi.fn(), isPending: false }),
  useTransitionCase: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe("Procedure Intra-Op UI Components (Phase P18)", () => {
  const baseDetail: CaseDetail = {
    case: {
      id: "case-p18",
      caseNumber: "CASE-0018",
      patientId: "pat-1",
      procedure: "COLONOSCOPY",
      procedureLabel: "Colonoscopy with Polypectomy",
      intent: "screening",
      indication: "Routine Screening",
      phase: "READY_FOR_PROCEDURE",
      roomId: "room-1",
      scheduledStart: "2026-10-16T09:00:00Z",
      durationMin: 30,
      patient: {
        id: "pat-1",
        displayName: "Jane Doe",
        initials: "JD",
        age: 46,
        sex: "F",
        dateOfBirth: "1980-01-01",
        mrn: "MRN-12345",
      },
      team: {
        surgeon: { id: "doc-1", name: "Dr. Alice Vance", initials: "AV" },
        anesthesia: { id: "anes-1", name: "Carol CRNA", initials: "CC" },
        nurse: { id: "rn-1", name: "Bob RN", initials: "BR" },
      },
      readiness: {
        prepConfirmed: true,
        eligibilityActive: true,
        hpCurrent: true,
        asaSet: true,
        consentsSigned: true,
        holdsConfirmed: true,
        escortConfirmed: true,
        npoConfirmed: true,
        ivPlaced: true,
        timeOutComplete: false,
      },
      timestamps: {},
    },
    patient: {
      id: "pat-1",
      firstName: "Jane",
      lastName: "Doe",
      dateOfBirth: "1980-01-01",
      mrn: "MRN-12345",
      sex: "F",
      phone: "555-0100",
      preferredLanguage: "English",
      coverage: null,
      escort: null,
      allergies: [],
      medications: [],
      createdAt: "2026-10-01T08:00:00Z",
    },
    hp: null,
    consents: [],
    vitals: [],
    timeOut: {
      caseId: "case-p18",
      checklist: {
        patientIdentity: false,
        procedureConfirmed: false,
        consentVerified: false,
        allergiesReviewed: false,
        equipmentReady: false,
        anticoagulationReviewed: false,
        siteAndLateralityConfirmed: false,
        prophylaxisReviewed: false,
        anticipatedIssuesReviewed: false,
      },
      attestations: [],
    },
    events: [],
    narration: [],
    specimens: [],
    images: [],
    anesthesia: {
      caseId: "case-p18",
      provider: { id: "anes-1", name: "Carol CRNA", initials: "CC" },
      technique: "MAC",
      airway: { device: "nasal_cannula", o2Lpm: 2 },
      airwayEvents: [],
      doses: [],
      vitals: [],
    },
    aldrete: null,
    discharge: null,
    summary: {
      noteStatus: "none",
      codingStatus: "not_ready",
      specimensPending: 0,
      surveillanceSet: false,
      lettersSent: 0,
    },
  };

  describe("ScopeAssignmentCard", () => {
    it("renders cleared status when scope is within 168-hour window", () => {
      const detail: CaseDetail = {
        ...baseDetail,
        scopeAssignment: {
          scopeSerial: "OLY-CF-123",
          scopeModel: "CF-H190L",
          reprocessedAt: "2026-10-15T10:00:00Z",
          assignedAt: "2026-10-16T10:00:00Z",
          assignedBy: { id: "doc-1", name: "Dr. Alice Vance", initials: "AV" },
          leakTestResult: "PASS",
          cycleOutcome: "PASS",
          hangTimeHours: 24,
          withinHangTimeWindow: true,
        },
      };

      const html = renderToStaticMarkup(<ScopeAssignmentCard detail={detail} />);
      expect(html).toContain("OLY-CF-123");
      expect(html).toContain("24h / 168h max");
      expect(html).toContain("Cleared");
      expect(html).not.toContain("ST91:2021 Endoscope Hang-Time Lock Active");
    });

    it("renders lockout alert when scope hang time exceeds 168 hours", () => {
      const detail: CaseDetail = {
        ...baseDetail,
        scopeAssignment: {
          scopeSerial: "OLY-CF-EXPIRED",
          scopeModel: "CF-H190L",
          reprocessedAt: "2026-10-01T10:00:00Z",
          assignedAt: "2026-10-16T10:00:00Z",
          assignedBy: { id: "doc-1", name: "Dr. Alice Vance", initials: "AV" },
          leakTestResult: "PASS",
          cycleOutcome: "PASS",
          hangTimeHours: 360,
          withinHangTimeWindow: false,
        },
      };

      const html = renderToStaticMarkup(<ScopeAssignmentCard detail={detail} />);
      expect(html).toContain("OLY-CF-EXPIRED");
      expect(html).toContain("360h / 168h max");
      expect(html).toContain("Locked (&gt;168h)");
      expect(html).toContain("ST91:2021 Endoscope Hang-Time Lock Active");
    });
  });

  describe("Gate2OverrideBar", () => {
    it("renders lockout banner when active scope lock violation exists (zero override allowance)", () => {
      const detail: CaseDetail = {
        ...baseDetail,
        scopeAssignment: {
          scopeSerial: "OLY-CF-EXPIRED",
          reprocessedAt: "2026-10-01T10:00:00Z",
          assignedAt: "2026-10-16T10:00:00Z",
          assignedBy: { id: "doc-1", name: "Dr. Alice Vance", initials: "AV" },
          leakTestResult: "PASS",
          cycleOutcome: "PASS",
          hangTimeHours: 360,
          withinHangTimeWindow: false,
        },
      };

      const html = renderToStaticMarkup(<Gate2OverrideBar detail={detail} />);
      expect(html).toContain("Hard Gate 2 Lockout");
      expect(html).toContain("ZERO clinical override allowance");
      expect(html).not.toContain("data-testid=\"gate2-override-open-btn\"");
    });

    it("renders clinical override trigger when no scope lock violation exists", () => {
      const html = renderToStaticMarkup(<Gate2OverrideBar detail={baseDetail} />);
      expect(html).toContain("Clinical Override");
      expect(html).toContain("data-testid=\"gate2-override-open-btn\"");
    });

    it("renders active override banner when already clinically overridden", () => {
      const detail: CaseDetail = {
        ...baseDetail,
        gate2Override: {
          actorId: "doc-1",
          actorName: "Dr. Alice Vance",
          actorRole: "SURGEON",
          reason: "Attending physician explicitly authorizes immediate entry.",
          overriddenBlockers: ["GATE2_ESCORT"],
          overriddenAt: "2026-10-16T09:15:00Z",
        },
      };

      const html = renderToStaticMarkup(<Gate2OverrideBar detail={detail} />);
      expect(html).toContain("Gate 2 Clinically Overridden");
      expect(html).toContain("Dr. Alice Vance");
      expect(html).toContain("Attending physician explicitly authorizes immediate entry.");
    });
  });

  describe("TimeOutPanel", () => {
    it("renders all 9 time-out checklist items", () => {
      const html = renderToStaticMarkup(<TimeOutPanel detail={baseDetail} />);
      expect(html).toContain("Patient identity (2 identifiers)");
      expect(html).toContain("Procedure &amp; site confirmed");
      expect(html).toContain("Consent signed &amp; verified");
      expect(html).toContain("Allergies reviewed");
      expect(html).toContain("Anticoagulation / holds reviewed");
      expect(html).toContain("Equipment &amp; scope ready");
      expect(html).toContain("Site &amp; laterality confirmed");
      expect(html).toContain("Prophylaxis reviewed");
      expect(html).toContain("Anticipated issues reviewed");
    });
  });
});
