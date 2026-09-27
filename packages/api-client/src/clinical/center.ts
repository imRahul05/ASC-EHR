import { API_ROUTES } from "@asc/config/api";
import type {
  AdminOverview,
  AuditEvent,
  AuditQuery,
  CodingQueueItem,
  DashboardSummary,
  MyCare,
  PathologyQueueItem,
  QualityMetrics,
  SearchResults,
  UpdateEscortPayload,
  UpdatePrepItemPayload,
  WhiteboardBoard,
  WorkItem,
  WorklistQuery,
} from "@asc/types";
import { http, toQuery } from "../http";

// ─── Center-wide views ──────────────────────────────────────────────────────

export function getWorklist(query: WorklistQuery = {}): Promise<readonly WorkItem[]> {
  return http.get(API_ROUTES.worklist, { query: toQuery(query) });
}

export function completeWorkItem(itemId: string): Promise<WorkItem> {
  return http.post(API_ROUTES.workItemComplete(itemId));
}

/** Today's live board (initials + case number only). */
export function getWhiteboard(): Promise<WhiteboardBoard> {
  return http.get(API_ROUTES.whiteboard);
}

/** Quality metrics with 30 days of history. */
export function getQualityMetrics(): Promise<QualityMetrics> {
  return http.get(API_ROUTES.quality);
}

/** Audit log, newest first. */
export function getAuditLog(query: AuditQuery = {}): Promise<readonly AuditEvent[]> {
  return http.get(API_ROUTES.audit, { query: toQuery(query) });
}

/** Staff roster, rooms, block templates, AI agent settings (read-only). */
export function getAdminOverview(): Promise<AdminOverview> {
  return http.get(API_ROUTES.admin);
}

export function getDashboardSummary(): Promise<DashboardSummary> {
  return http.get(API_ROUTES.dashboardSummary);
}

/** Command-palette search across patients and cases. */
export function searchAll(q: string): Promise<SearchResults> {
  return http.get(API_ROUTES.search, { query: { q } });
}

export function getPathologyQueue(): Promise<readonly PathologyQueueItem[]> {
  return http.get(API_ROUTES.pathologyQueue);
}

export function getCodingQueue(): Promise<readonly CodingQueueItem[]> {
  return http.get(API_ROUTES.codingQueue);
}

// ─── Patient portal (signed-in PATIENT) ─────────────────────────────────────

export function getMyCare(): Promise<MyCare> {
  return http.get(API_ROUTES.portalMyCare);
}

export function updatePrepItem(payload: UpdatePrepItemPayload): Promise<MyCare> {
  return http.post(API_ROUTES.portalPrep, payload);
}

export function updateMyEscort(payload: UpdateEscortPayload): Promise<MyCare> {
  return http.put(API_ROUTES.portalEscort, payload);
}

// ─── Demo ───────────────────────────────────────────────────────────────────

/** Re-seeds the in-memory demo database (MSW only). */
export function resetDemo(): Promise<void> {
  return http.post(API_ROUTES.demoReset);
}
