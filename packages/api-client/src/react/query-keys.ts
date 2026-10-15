import type { AuditQuery, IsoDate, PatientSearchQuery, WorklistQuery } from "@asc/types";
import type { PatientSearchBodyInput } from "@asc/validation/patients/search";

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
    search: (query: PatientSearchBodyInput = {}) => ["patients", "search", query] as const,
    detail: (patientId: string) => ["patients", "detail", patientId] as const,
  },
  referrals: {
    all: ["referrals"] as const,
    list: ["referrals", "list"] as const,
    detail: (referralId: string) => ["referrals", "detail", referralId] as const,
  },
  schedule: {
    all: ["schedule"] as const,
    day: (date?: IsoDate, facilityId?: string) => ["schedule", date ?? "today", facilityId?.trim() ?? ""] as const,
  },
  cases: {
    all: ["cases"] as const,
    detail: (caseId: string, facilityId?: string) =>
      facilityId && facilityId.trim() !== ""
        ? (["cases", caseId, "detail", facilityId.trim()] as const)
        : (["cases", caseId, "detail"] as const),
    consent: (caseId: string, facilityId?: string) =>
      facilityId && facilityId.trim() !== ""
        ? (["cases", caseId, "consent", facilityId.trim()] as const)
        : (["cases", caseId, "consent"] as const),
    note: (caseId: string) => ["cases", caseId, "note"] as const,
    coding: (caseId: string) => ["cases", caseId, "coding"] as const,
    pathology: (caseId: string) => ["cases", caseId, "pathology"] as const,
    hp: (caseId: string, facilityId?: string) =>
      facilityId && facilityId.trim() !== ""
        ? (["cases", caseId, "hp", facilityId.trim()] as const)
        : (["cases", caseId, "hp"] as const),
  },
  worklist: {
    all: ["worklist"] as const,
    list: (query: WorklistQuery = {}) => ["worklist", query] as const,
  },
  whiteboard: (params?: { readonly mode?: "tv" | "clinical"; readonly facilityId?: string }) =>
    ["whiteboard", params?.mode ?? "clinical", params?.facilityId ?? ""] as const,
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
