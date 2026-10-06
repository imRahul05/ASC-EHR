import type { AuditQuery, IsoDate, PatientSearchQuery, WorklistQuery } from "@asc/types";

/**
 * TanStack Query key factory — the only place query keys are spelled.
 * Every clinical key starts with a domain segment so `invalidateClinical` can refresh them all.
 */
export const queryKeys = {
  auth: {
    all: ["auth"] as const,
    demoPresets: ["auth", "demo-presets"] as const,
    me: ["auth", "me"] as const,
  },
  patients: {
    all: ["patients"] as const,
    list: (query: PatientSearchQuery = {}) => ["patients", "list", query] as const,
    detail: (patientId: string) => ["patients", "detail", patientId] as const,
  },
  referrals: {
    all: ["referrals"] as const,
    list: ["referrals", "list"] as const,
    detail: (referralId: string) => ["referrals", "detail", referralId] as const,
  },
  schedule: {
    all: ["schedule"] as const,
    day: (date?: IsoDate) => ["schedule", date ?? "today"] as const,
  },
  cases: {
    all: ["cases"] as const,
    detail: (caseId: string) => ["cases", caseId, "detail"] as const,
    note: (caseId: string) => ["cases", caseId, "note"] as const,
    coding: (caseId: string) => ["cases", caseId, "coding"] as const,
    pathology: (caseId: string) => ["cases", caseId, "pathology"] as const,
  },
  worklist: {
    all: ["worklist"] as const,
    list: (query: WorklistQuery = {}) => ["worklist", query] as const,
  },
  whiteboard: ["whiteboard"] as const,
  quality: ["quality"] as const,
  audit: {
    all: ["audit"] as const,
    list: (query: AuditQuery = {}) => ["audit", query] as const,
  },
  admin: ["admin"] as const,
  dashboard: ["dashboard", "summary"] as const,
  search: (q: string) => ["search", q] as const,
  pathologyQueue: ["pathology-queue"] as const,
  codingQueue: ["coding-queue"] as const,
  myCare: ["portal", "my-care"] as const,
} as const;
