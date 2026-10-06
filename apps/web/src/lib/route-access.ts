import type { Capability } from "@asc/types";

/**
 * Capabilities that open each signed-in screen (any of them is enough; `null` = every
 * signed-in user). One table for the route guards and the sidebar, keyed like nav-config's
 * routes. UI gating is convenience: apps/api and Medplum enforce the same rules.
 */
export const ROUTE_ACCESS = {
  dashboard: ["case.read"],
  schedule: ["schedule.read"],
  patients: ["patient.read"],
  referrals: ["referral.triage", "patient.register"],
  whiteboard: ["whiteboard.read"],
  cases: ["case.read"],
  worklist: ["case.advance"],
  pathology: ["pathology.reconcile"],
  coding: ["coding.review"],
  quality: ["quality.read"],
  audit: ["audit.read"],
  admin: ["admin.users"],
  "my-care": ["portal.self.read"],
  guide: null,
} as const satisfies Readonly<Record<string, readonly Capability[] | null>>;
