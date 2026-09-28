import { formatTime24, PHASE_GROUP, PHASE_LABEL } from "@asc/clinical-rules"
import type { CasePhase } from "@asc/types"
import { Plus } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "../../lib/utils"
import { PHASE_GROUP_CLASS, PHASE_GROUP_DOT, PHASE_GROUP_ICON } from "./phase-style"

export interface RoomTimeGridRoom {
  readonly id: string
  readonly name: string
  /** Small status line under the room name (e.g. "In use"). */
  readonly status?: ReactNode
}

export interface RoomTimeGridItem {
  readonly id: string
  readonly roomId: string
  /** ISO start time. */
  readonly start: string
  readonly durationMin: number
  readonly phase: CasePhase
  readonly title: ReactNode
  readonly subtitle?: ReactNode
  /** Right-aligned detail on the first line (e.g. case number). */
  readonly meta?: ReactNode
  /** Accessible label for the whole block (no need to repeat the time). */
  readonly label: string
}

export interface RoomTimeGridProps {
  readonly rooms: readonly RoomTimeGridRoom[]
  readonly items: readonly RoomTimeGridItem[]
  /** Local calendar date `YYYY-MM-DD` the grid shows. */
  readonly date: string
  readonly startHour?: number
  readonly endHour?: number
  /** Minutes per bookable slot. */
  readonly slotMinutes?: number
  /** ISO "now"; draws a line when it falls on this day. */
  readonly now?: string
  readonly onItemClick?: (id: string) => void
  /** Empty-slot click (e.g. open the booking sheet prefilled). */
  readonly onSlotClick?: (roomId: string, startIso: string) => void
  readonly className?: string
}

const HOUR_PX = 96
const MINUTE_MS = 60_000

function dayAt(date: string, hour: number, minute = 0): Date {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number)
  return new Date(year, month - 1, day, hour, minute)
}

/** Day time grid: one column per room, case blocks positioned by start and duration, tinted by phase group. */
export function RoomTimeGrid({
  rooms,
  items,
  date,
  startHour = 7,
  endHour = 17,
  slotMinutes = 30,
  now,
  onItemClick,
  onSlotClick,
  className,
}: RoomTimeGridProps) {
  const dayStart = dayAt(date, startHour).getTime()
  const totalMin = (endHour - startHour) * 60
  const heightPx = (endHour - startHour) * HOUR_PX
  const toPx = (minutes: number) => (minutes / 60) * HOUR_PX
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index)
  const slots = Array.from({ length: totalMin / slotMinutes }, (_, index) => index * slotMinutes)
  const nowMin = now ? (Date.parse(now) - dayStart) / MINUTE_MS : -1
  const showNow = nowMin >= 0 && nowMin <= totalMin

  return (
    <div data-testid="room-time-grid" className={cn("overflow-x-auto rounded-xl border border-border bg-card shadow-xs", className)}>
      <div className="grid min-w-[40rem]" style={{ gridTemplateColumns: `3.5rem repeat(${rooms.length}, minmax(10rem, 1fr))` }}>
        <div className="sticky left-0 z-20 border-b border-border bg-card" />
        {rooms.map((room) => (
          <div key={room.id} className="border-b border-l border-border px-3 py-2.5">
            <p className="text-sm font-semibold tracking-tight">{room.name}</p>
            {room.status && <div className="text-xs text-muted-foreground">{room.status}</div>}
          </div>
        ))}

        <div className="relative sticky left-0 z-20 bg-card" style={{ height: heightPx }} aria-hidden>
          {hours.map((hour) => (
            <span
              key={hour}
              className="absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground tabular-nums first:translate-y-0"
              style={{ top: toPx((hour - startHour) * 60) }}
            >
              {String(hour).padStart(2, "0")}:00
            </span>
          ))}
        </div>

        {rooms.map((room) => (
          <div key={room.id} className="relative border-l border-border" style={{ height: heightPx }} data-testid={`room-column-${room.id}`}>
            {hours.slice(1, -1).map((hour) => (
              <div key={hour} aria-hidden className="absolute inset-x-0 border-t border-border/70" style={{ top: toPx((hour - startHour) * 60) }} />
            ))}
            {hours.slice(0, -1).map((hour) => (
              <div
                key={`half-${hour}`}
                aria-hidden
                className="absolute inset-x-0 border-t border-dashed border-border/40"
                style={{ top: toPx((hour - startHour) * 60 + 30) }}
              />
            ))}

            {onSlotClick &&
              slots.map((minute) => {
                const slotIso = new Date(dayStart + minute * MINUTE_MS).toISOString()
                return (
                  <button
                    key={minute}
                    type="button"
                    onClick={() => onSlotClick(room.id, slotIso)}
                    aria-label={`Book ${room.name} at ${formatTime24(slotIso)}`}
                    data-testid="room-time-grid-slot"
                    className="group/slot absolute inset-x-1 flex items-center justify-center rounded-md text-xs text-muted-foreground opacity-0 outline-none hover:bg-accent hover:opacity-100 focus-visible:bg-accent focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50"
                    style={{ top: toPx(minute) + 1, height: toPx(slotMinutes) - 2 }}
                  >
                    <Plus aria-hidden className="size-3.5" />
                    <span className="ml-1 tabular-nums">{formatTime24(slotIso)}</span>
                  </button>
                )
              })}

            {items
              .filter((item) => item.roomId === room.id)
              .map((item) => {
                const offset = (Date.parse(item.start) - dayStart) / MINUTE_MS
                const group = PHASE_GROUP[item.phase]
                const Icon = PHASE_GROUP_ICON[group]
                const compact = item.durationMin < 30
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={onItemClick ? () => onItemClick(item.id) : undefined}
                    aria-label={`${item.label}, ${formatTime24(item.start)}, ${PHASE_LABEL[item.phase]}`}
                    data-testid="schedule-case-block"
                    data-phase={item.phase}
                    className={cn(
                      "absolute inset-x-1 z-10 flex overflow-hidden rounded-md border border-foreground/5 text-left shadow-xs outline-none transition-[filter] hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transition-none dark:hover:brightness-110",
                      PHASE_GROUP_CLASS[group],
                      group === "stopped" && "left-1/2 z-[5] opacity-70"
                    )}
                    style={{ top: toPx(Math.max(0, offset)) + 1, height: Math.max(toPx(item.durationMin) - 2, 22) }}
                  >
                    <span aria-hidden className={cn("w-1 shrink-0", PHASE_GROUP_DOT[group])} />
                    <span className="min-w-0 flex-1 px-2 py-1">
                      <span className="flex items-center justify-between gap-2 text-[11px] tabular-nums opacity-90">
                        <span className="flex items-center gap-1">
                          <Icon aria-hidden className="size-3" />
                          {formatTime24(item.start)}
                        </span>
                        {item.meta && <span className="truncate font-mono">{item.meta}</span>}
                      </span>
                      <span className={cn("block truncate text-xs font-semibold", compact && "sr-only")}>{item.title}</span>
                      {item.subtitle && item.durationMin >= 45 && <span className="block truncate text-[11px] opacity-85">{item.subtitle}</span>}
                    </span>
                  </button>
                )
              })}

            {showNow && (
              <div aria-hidden className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-primary" style={{ top: toPx(nowMin) }}>
                <span className="absolute -top-1 -left-1 size-2 rounded-full bg-primary" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
