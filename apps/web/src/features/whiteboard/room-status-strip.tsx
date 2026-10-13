import type { Room, WhiteboardCard } from "@asc/types";
import { toWhiteboardStage, WhiteboardTile, type WhiteboardTileCase } from "@asc/ui";
import { formatTime24 } from "@asc/clinical-rules/time";

interface RoomStatusStripProps {
  readonly rooms: readonly Room[];
  readonly cards: readonly WhiteboardCard[];
  readonly tv: boolean;
  readonly elapsed?: (enteredAt: string | undefined) => number | null;
}

const ASC_ROOMS: readonly { readonly id: string; readonly name: string }[] = [
  { id: "room-1", name: "Room 1" },
  { id: "room-2", name: "Room 2" },
  { id: "room-3", name: "Room 3" },
  { id: "room-4", name: "Room 4" },
];

const ACTIVE_ROOM_PHASES = new Set([
  "in_procedure",
  "in_room",
  "procedure_start",
  "procedure_end",
  "ready_for_procedure",
  "in_progress",
]);

function findRoomCase(room: Room, cards: readonly WhiteboardCard[]): WhiteboardCard | undefined {
  if (room.currentCaseId) {
    const directMatch = cards.find((card) => card.caseId === room.currentCaseId);
    if (directMatch) return directMatch;
  }

  if (room.status === "in_use") {
    return cards.find(
      (card) => card.roomId === room.id && ACTIVE_ROOM_PHASES.has(card.phase.toLowerCase()),
    );
  }

  return undefined;
}

/**
 * Live room tiles for all ASC procedure suites (room-1 through room-4).
 * Rendered with WhiteboardTile enforcing strict PHI compliance (Patient Initials + Case Number ONLY).
 */
export function RoomStatusStrip({ rooms, cards, tv, elapsed }: RoomStatusStripProps) {
  const allRooms: readonly Room[] = ASC_ROOMS.map((std) => {
    const found = rooms.find((r) => r.id === std.id);
    return found ?? { id: std.id, name: std.name, status: "idle" as const };
  });

  return (
    <section aria-label="Procedure rooms status" data-testid="whiteboard-rooms">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {allRooms.map((room) => {
          const current = findRoomCase(room, cards);

          const tileCase: WhiteboardTileCase | null = current
            ? {
                caseId: current.caseId,
                caseNumber: current.caseNumber,
                initials: current.initials,
                stage: toWhiteboardStage(current.phase),
                elapsedMin: elapsed ? elapsed(current.phaseEnteredAt) : null,
                scheduledStart: formatTime24(current.scheduledStart),
                physicianInitials: current.surgeonInitials,
              }
            : null;

          return (
            <div key={room.id} data-testid={`whiteboard-room-${room.id}`} data-status={room.status}>
              <WhiteboardTile room={room} currentCase={tileCase} tv={tv} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
