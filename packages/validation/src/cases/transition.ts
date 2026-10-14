import { z } from "zod";

export const ALL_VALID_TRANSITION_TARGETS = [
  // Physical stages (REQ-5 §164–180)
  "requested",
  "scheduled",
  "confirmed",
  "arrived",
  "preop",
  "in_room",
  "in-room",
  "procedure_start",
  "procedure-start",
  "procedure_end",
  "procedure-end",
  "pacu",
  "discharged",
  "cancelled",
  "no_show",
  "no-show",
  // Legacy / administrative phases
  "SCHEDULED",
  "CONFIRMED",
  "ARRIVED",
  "PRE_OP",
  "pre-op",
  "READY_FOR_PROCEDURE",
  "ready-for-procedure",
  "IN_PROCEDURE",
  "in-procedure",
  "RECOVERY",
  "recovery",
  "READY_FOR_DISCHARGE",
  "ready-for-discharge",
  "DISCHARGED",
  "CHART_COMPLETE",
  "chart-complete",
  "CODED",
  "coded",
  "EXPORTED",
  "exported",
  "CLOSED",
  "closed",
  "CANCELLED",
  "NO_SHOW",
] as const;

export type ValidTransitionTarget = typeof ALL_VALID_TRANSITION_TARGETS[number];

export const transitionCaseSchema = z.object({
  to: z
    .string()
    .trim()
    .min(1, "Target stage or phase is required")
    .refine(
      (val): val is ValidTransitionTarget =>
        (ALL_VALID_TRANSITION_TARGETS as readonly string[]).includes(val),
      "Invalid target stage or phase",
    ),
  reason: z.string().trim().max(500).optional(),
  overrideReason: z.string().trim().max(500).optional(),
});

export type TransitionCaseInput = z.infer<typeof transitionCaseSchema>;

