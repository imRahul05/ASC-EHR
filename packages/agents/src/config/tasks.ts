/**
 * Agent task catalog — what kinds of work the gateway runs, and the policy for each.
 *
 * Adding a task: add it to `Task`, then give it a profile in `TASK_PROFILES`
 * (the compiler rejects a task without a profile).
 */

import { Reasoning, type ReasoningTier } from './reasoning.js';

export const Task = {
  MedicalCoding: 'medical-coding',
  DiagnosticReasoning: 'diagnostic-reasoning',
  PatientInstructions: 'patient-instructions',
  Summarization: 'summarization',
  DataExtraction: 'data-extraction',
  Validation: 'validation',
  Classification: 'classification',
  General: 'general',
} as const;

export type TaskType = (typeof Task)[keyof typeof Task];

/**
 * How long a gateway call may take. Unset fields fall back to the gateway's
 * `latencyBudget` option, then to `DEFAULT_LATENCY_BUDGET`.
 */
export interface LatencyBudget {
  /** Max time for ONE model in the chain (incl. the SDK's same-model retries) before falling back. */
  attemptTimeoutMs?: number;
  /** Max time for the whole call across all models. Once spent, no further model is tried. */
  totalTimeoutMs?: number;
}

/** 60s per model, 120s per call. */
export const DEFAULT_LATENCY_BUDGET = {
  attemptTimeoutMs: 60_000,
  totalTimeoutMs: 120_000,
} as const satisfies Required<LatencyBudget>;

export interface TaskProfile {
  /** Minimum reasoning tier. Callers may escalate, never downgrade. */
  reasoning: ReasoningTier;
  /**
   * The task inherently operates on PHI: it is always routed to BAA providers,
   * even if a caller passes `containsPhi: false`.
   */
  handlesPhi: boolean;
  description: string;
  /** Optional task-specific latency budget; overrides the gateway's per field. */
  latencyBudget?: LatencyBudget;
}

export const TASK_PROFILES = {
  [Task.MedicalCoding]: {
    reasoning: Reasoning.High,
    handlesPhi: true,
    description: 'CPT / ICD-10 / modifier suggestions from clinical documentation.',
  },
  [Task.DiagnosticReasoning]: {
    reasoning: Reasoning.High,
    handlesPhi: true,
    description: 'Clinical reasoning over patient findings.',
  },
  [Task.PatientInstructions]: {
    reasoning: Reasoning.Medium,
    handlesPhi: true,
    description: 'Plain-language, patient-facing instructions (e.g. discharge) from structured clinical facts.',
  },
  [Task.Summarization]: {
    reasoning: Reasoning.Medium,
    handlesPhi: false,
    description: 'Condense text into a shorter summary.',
  },
  [Task.DataExtraction]: {
    reasoning: Reasoning.Low,
    handlesPhi: false,
    description: 'Pull structured fields out of text.',
  },
  [Task.Validation]: {
    reasoning: Reasoning.Low,
    handlesPhi: false,
    description: 'Check output against rules or a schema.',
  },
  [Task.Classification]: {
    reasoning: Reasoning.Low,
    handlesPhi: false,
    description: 'Assign a label from a fixed set.',
  },
  [Task.General]: {
    reasoning: Reasoning.Medium,
    handlesPhi: false,
    description: 'Anything that fits no specific task.',
  },
} as const satisfies Record<TaskType, TaskProfile>;

export type TaskProfiles = Readonly<Record<TaskType, TaskProfile>>;
