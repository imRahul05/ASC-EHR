import type { ActiveDemoPersonaId } from "@asc/types";

export type { ActiveDemoPersonaId };

/**
 * Demo personas: labels for one-click sign-in and the guide (D-A4: persona = label). What a
 * persona may do comes from the role assignments in the mock identities, never from this table.
 */
export const PERSONAS = {
  "demo-admin": {
    home: "/dashboard",
    label: "Front desk / Admin",
    short: "Front desk",
    description: "Scheduling, referrals, coding, audit",
    lands: "Center operations",
    tryThis: "Referrals, booking, coding, audit",
    order: 0,
  },
  "demo-nurse": {
    home: "/dashboard",
    label: "Nurse",
    short: "Nurse",
    description: "Pre-op, procedure room, PACU",
    lands: "Whiteboard",
    tryThis: "Check-in, pre-op, room, recovery",
    order: 1,
  },
  "demo-surgeon": {
    home: "/dashboard",
    label: "Gastroenterologist",
    short: "Surgeon",
    description: "Slate, notes, pathology",
    lands: "Slate + sign queue",
    tryThis: "AI note, pathology, quality",
    order: 2,
  },
  "demo-anesthesia": {
    home: "/dashboard",
    label: "Anesthesia",
    short: "Anesthesia",
    description: "Sedation and airway",
    lands: "Anesthesia queue",
    tryThis: "Sedation flowsheet, airway",
    order: 3,
  },
} as const satisfies Record<
  ActiveDemoPersonaId,
  { readonly home: string; readonly label: string; readonly short: string; readonly description: string; readonly lands: string; readonly tryThis: string; readonly order: number }
>;

/** Type guard verifying an ID belongs to an active clinical demo persona. */
export function isActivePersona(id: string): id is ActiveDemoPersonaId {
  return Object.hasOwn(PERSONAS, id);
}
