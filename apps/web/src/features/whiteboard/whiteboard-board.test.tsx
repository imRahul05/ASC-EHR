import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Room, WhiteboardBoard as WhiteboardBoardData } from "@asc/types";
import { WhiteboardTile } from "@asc/ui";
import { WhiteboardBoard } from "./whiteboard-board";
import { WhiteboardCard } from "./whiteboard-card";

const MOCK_ROOMS: readonly Room[] = [
  { id: "room-1", name: "OR 1", status: "in_use", currentCaseId: "case-101" },
  { id: "room-2", name: "OR 2", status: "turnover", currentCaseId: "case-102" },
  { id: "room-3", name: "OR 3", status: "idle" },
  { id: "room-4", name: "OR 4", status: "idle" },
];

const MOCK_BOARD_DATA: WhiteboardBoardData = {
  generatedAt: "2026-10-14T10:00:00.000Z",
  rooms: MOCK_ROOMS,
  cards: [
    {
      caseId: "case-101",
      caseNumber: "CASE-101",
      initials: "J.D.",
      phase: "IN_PROCEDURE",
      roomId: "room-1",
      procedureLabel: "Colonoscopy",
      scheduledStart: "2026-10-14T09:30:00.000Z",
      phaseEnteredAt: "2026-10-14T09:40:00.000Z",
      surgeonInitials: "AV",
      flags: ["allergy"],
    },
    {
      caseId: "case-102",
      caseNumber: "CASE-102",
      initials: "A.W.",
      phase: "RECOVERY",
      roomId: "room-2",
      procedureLabel: "EGD",
      scheduledStart: "2026-10-14T08:30:00.000Z",
      phaseEnteredAt: "2026-10-14T09:15:00.000Z",
      surgeonInitials: "PN",
      flags: [],
    },
    {
      caseId: "case-103",
      caseNumber: "CASE-103",
      initials: "M.K.",
      phase: "PRE_OP",
      roomId: "room-3",
      procedureLabel: "Colonoscopy with polypectomy",
      scheduledStart: "2026-10-14T11:00:00.000Z",
      surgeonInitials: "SO",
      flags: ["anticoagulant"],
    },
  ],
};

vi.mock("@asc/api-client/react", () => ({
  useWhiteboard: () => ({
    data: MOCK_BOARD_DATA,
    isPending: false,
    isError: false,
    isRefetchError: false,
    refetch: vi.fn(),
  }),
}));

describe("WhiteboardBoard & WhiteboardTile", () => {
  it("renders live room strip with all 4 standard OR rooms and cases by phase", () => {
    const html = renderToStaticMarkup(<WhiteboardBoard />);

    expect(html).toContain('data-testid="whiteboard"');
    expect(html).toContain('data-testid="whiteboard-tv-toggle"');
    expect(html).toContain('data-testid="whiteboard-rooms"');
    expect(html).toContain('data-testid="whiteboard-room-room-1"');

    // Rooms 1 through 4 present
    expect(html).toContain("OR 1");
    expect(html).toContain("OR 2");
    expect(html).toContain("OR 3");
    expect(html).toContain("OR 4");

    // Case cards rendered
    expect(html).toContain('data-testid="whiteboard-card-case-101"');
    expect(html).toContain('data-testid="whiteboard-card-case-102"');
    expect(html).toContain('data-testid="whiteboard-card-case-103"');

    // Patient initials and case numbers present
    expect(html).toContain("J.D.");
    expect(html).toContain("CASE-101");
    expect(html).toContain("A.W.");
    expect(html).toContain("CASE-102");
    expect(html).toContain("M.K.");
    expect(html).toContain("CASE-103");
  });

  describe("CRITICAL PHI Audit (P15 Q1 Public Display Policy)", () => {
    it("strictly prevents any full names, DOB, SSN, MRN, or clinical indications from leaking into the DOM", () => {
      const html = renderToStaticMarkup(<WhiteboardBoard />);

      // Realistic patient PHI identifiers that MUST NEVER appear in public hallway displays
      const forbiddenPhiStrings: readonly string[] = [
        "Jonathan",
        "Jonathan Doe",
        "Alice Wonderland",
        "Michael Knight",
        "1978-03-24",
        "1985-11-12",
        "1990-07-04",
        "123-45-6789",
        "987-65-4321",
        "MRN-101",
        "MRN-102",
        "MRN-103",
        "Severe Crohn's flare",
        "Refractory ulcerative colitis",
        "Suspicious malignant lesion in descending colon",
      ];

      for (const phi of forbiddenPhiStrings) {
        expect(html).not.toContain(phi);
      }

      // Initials and case numbers remain visible and compliant
      expect(html).toContain("J.D.");
      expect(html).toContain("A.W.");
      expect(html).toContain("M.K.");
    });
  });

  describe("WhiteboardTile Component", () => {
    it("renders TV mode room tile with stage badge and initials/case number only", () => {
      const html = renderToStaticMarkup(
        <WhiteboardTile
          room={{ id: "room-1", name: "OR 1", status: "in_use" }}
          currentCase={{
            caseId: "case-999",
            caseNumber: "CASE-999",
            initials: "B.C.",
            stage: "in_progress",
            elapsedMin: 22,
            physicianInitials: "AV",
          }}
          tv={true}
        />,
      );

      expect(html).toContain('data-testid="whiteboard-tile-room-1"');
      expect(html).toContain("OR 1");
      expect(html).toContain("In Progress");
      expect(html).toContain("B.C.");
      expect(html).toContain("CASE-999");
      expect(html).toContain("22m");

      // Verify zero patient full name in tile DOM
      expect(html).not.toContain("Bob Cratchit");
    });

    it("renders idle available tile when no case is in room", () => {
      const html = renderToStaticMarkup(
        <WhiteboardTile
          room={{ id: "room-4", name: "OR 4", status: "idle" }}
          currentCase={null}
          tv={false}
        />,
      );

      expect(html).toContain('data-testid="whiteboard-tile-room-4"');
      expect(html).toContain("OR 4");
      expect(html).toContain("Available");
      expect(html).toContain("No case currently in room");
    });
  });

  describe("WhiteboardCard Privacy & TV Kiosk Guard", () => {
    const cardData = MOCK_BOARD_DATA.cards[0];

    it("renders clinical links and flags in staff desktop mode (tv = false)", () => {
      const html = renderToStaticMarkup(
        <WhiteboardCard card={cardData} elapsedMin={15} warnAfterMin={30} tv={false} />,
      );

      expect(html).toContain('href="/cases/case-101"');
      expect(html).toContain('data-testid="whiteboard-flag-allergy"');
    });

    it("unlinks case navigation and hides clinical flags in public TV mode (tv = true)", () => {
      const html = renderToStaticMarkup(
        <WhiteboardCard card={cardData} elapsedMin={15} warnAfterMin={30} tv={true} />,
      );

      expect(html).not.toContain('href="/cases');
      expect(html).not.toContain("href=");
      expect(html).not.toContain('data-testid="whiteboard-flag-allergy"');
      expect(html).toContain("J.D.");
      expect(html).toContain("CASE-101");
    });
  });
});
