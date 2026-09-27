import type { PhaseGroup } from "@asc/types"
import {
  Activity,
  Ban,
  CalendarClock,
  CircleCheckBig,
  ClipboardCheck,
  HeartPulse,
  type LucideIcon,
} from "lucide-react"

/** Token classes per phase group (full literal strings so Tailwind generates them). */
export const PHASE_GROUP_CLASS: Readonly<Record<PhaseGroup, string>> = {
  scheduling: "bg-phase-scheduling text-phase-scheduling-foreground",
  dayof: "bg-phase-dayof text-phase-dayof-foreground",
  procedure: "bg-phase-procedure text-phase-procedure-foreground",
  recovery: "bg-phase-recovery text-phase-recovery-foreground",
  post: "bg-phase-post text-phase-post-foreground",
  stopped: "bg-phase-stopped text-phase-stopped-foreground",
}

/** Solid dot / accent colour per phase group. */
export const PHASE_GROUP_DOT: Readonly<Record<PhaseGroup, string>> = {
  scheduling: "bg-phase-scheduling-foreground",
  dayof: "bg-phase-dayof-foreground",
  procedure: "bg-phase-procedure-foreground",
  recovery: "bg-phase-recovery-foreground",
  post: "bg-phase-post-foreground",
  stopped: "bg-phase-stopped-foreground",
}

/** Icon per phase group — colour is never the only signal. */
export const PHASE_GROUP_ICON: Readonly<Record<PhaseGroup, LucideIcon>> = {
  scheduling: CalendarClock,
  dayof: ClipboardCheck,
  procedure: Activity,
  recovery: HeartPulse,
  post: CircleCheckBig,
  stopped: Ban,
}
