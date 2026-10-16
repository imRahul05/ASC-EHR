import { API_ROUTES } from "@asc/config/api";
import type {
  AdminOverview,
  ClinicalTimelineEvent,
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
  ClaimWorkItemPayload,
  CompleteWorkItemPayload,
  CreateWorkItemPayload,
  WorkItem,
  WorklistQuery,
} from "@asc/types";
import { http, toQuery } from "../http";

// ─── Center-wide views ──────────────────────────────────────────────────────

export interface ClaimWorkItemArgs {
  readonly itemId: string;
  readonly payload?: ClaimWorkItemPayload;
  readonly facilityId?: string;
}

export interface CompleteWorkItemArgs {
  readonly itemId: string;
  readonly payload?: CompleteWorkItemPayload;
  readonly facilityId?: string;
}

export function getWorklist(query: WorklistQuery = {}): Promise<readonly WorkItem[]> {
  const resolvedFacility = query.facilityId?.trim();
  return http.get(API_ROUTES.worklist, {
    query: toQuery(query),
    headers: resolvedFacility ? { "x-facility-id": resolvedFacility } : undefined,
  });
}

export function createWorkItem(payload: CreateWorkItemPayload): Promise<WorkItem> {
  const resolvedFacility = payload.facilityId?.trim();
  return http.post(API_ROUTES.worklist, payload, {
    headers: resolvedFacility ? { "x-facility-id": resolvedFacility } : undefined,
  });
}

export function claimWorkItem(
  input: string | ClaimWorkItemArgs,
  payload: ClaimWorkItemPayload = {},
  facilityId?: string,
): Promise<WorkItem> {
  const resolvedItemId = typeof input === "string" ? input : input.itemId;
  const resolvedPayload = typeof input === "string" ? payload : (input.payload ?? {});
  const resolvedFacility = typeof input === "string" ? facilityId?.trim() : input.facilityId?.trim();
  return http.post(API_ROUTES.workItemClaim(resolvedItemId), resolvedPayload, {
    headers: resolvedFacility ? { "x-facility-id": resolvedFacility } : undefined,
  });
}

export function completeWorkItem(
  input: string | CompleteWorkItemArgs,
  payload: CompleteWorkItemPayload = {},
  facilityId?: string,
): Promise<WorkItem> {
  const resolvedItemId = typeof input === "string" ? input : input.itemId;
  const resolvedPayload = typeof input === "string" ? payload : (input.payload ?? {});
  const resolvedFacility = typeof input === "string" ? facilityId?.trim() : input.facilityId?.trim();
  return http.post(API_ROUTES.workItemComplete(resolvedItemId), resolvedPayload, {
    headers: resolvedFacility ? { "x-facility-id": resolvedFacility } : undefined,
  });
}


/** Today's live board (initials + case number only). */
export function getWhiteboard(params?: {
  readonly mode?: "tv" | "clinical";
  readonly facilityId?: string;
}): Promise<WhiteboardBoard> {
  const query = params ? toQuery(params) : undefined;
  const resolvedFacility = params?.facilityId?.trim();
  return http.get(
    API_ROUTES.whiteboard,
    query !== undefined || resolvedFacility !== undefined
      ? {
          query,
          headers: resolvedFacility ? { "x-facility-id": resolvedFacility } : undefined,
        }
      : undefined,
  );
}

/** Quality metrics with 30 days of history. */
export function getQualityMetrics(): Promise<QualityMetrics> {
  return http.get(API_ROUTES.quality);
}

/** Audit log, newest first. */
export function getAuditLog(query: AuditQuery = {}): Promise<readonly ClinicalTimelineEvent[]> {
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
