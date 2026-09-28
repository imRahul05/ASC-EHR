import type { Room, WhiteboardCard } from "@asc/types";
import { cn } from "@asc/ui";
import { ROOM_STATUS_META } from "./whiteboard-config";

interface RoomStatusStripProps {
  readonly rooms: readonly Room[];
  readonly cards: readonly WhiteboardCard[];
  readonly tv: boolean;
}

/** One tile per procedure room: status (icon + text) and the case number in it. */
export function RoomStatusStrip({ rooms, cards, tv }: RoomStatusStripProps) {
  return (
    <ul className="grid gap-3 sm:grid-cols-3" aria-label="Procedure rooms" data-testid="whiteboard-rooms">
      {rooms.map((room) => {
        const { label, icon: Icon, tone } = ROOM_STATUS_META[room.status];
        const current = cards.find((card) => card.caseId === room.currentCaseId);
        return (
          <li
            key={room.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-xs"
            data-testid={`whiteboard-room-${room.id}`}
            data-status={room.status}
          >
            <div className="min-w-0">
              <p className={cn("font-semibold tracking-tight", tv ? "text-2xl" : "text-sm")}>{room.name}</p>
              <p className={cn("font-mono text-muted-foreground tabular-nums", tv ? "text-base" : "text-xs")}>
                {current ? `${current.caseNumber} · ${current.initials}` : "No case in room"}
              </p>
            </div>
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium", tone, tv ? "text-base" : "text-xs")}>
              <Icon aria-hidden className={cn("size-3.5", room.status === "in_use" && "motion-safe:animate-pulse")} />
              {label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
