import type { DemoPersonaId } from "@asc/types";

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
  "demo-patient": {
    home: "/my-care",
    label: "Patient",
    short: "Patient",
    description: "Portal: prep, escort, results",
    lands: "My procedure",
    tryThis: "Prep, escort, results",
    order: 4,
  },
} as const satisfies Record<
  DemoPersonaId,
  { readonly home: string; readonly label: string; readonly short: string; readonly description: string; readonly lands: string; readonly tryThis: string; readonly order: number }
>;
