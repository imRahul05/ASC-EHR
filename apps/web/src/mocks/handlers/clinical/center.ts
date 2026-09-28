import { isPhaseAtLeast, STOPPED_PHASES, toIsoDate } from "@asc/clinical-rules";
import { API_ROUTE_PATTERNS as P } from "@asc/config/api";
import type {
  AdminOverview,
  AuditEvent,
  CodingQueueItem,
  DashboardSummary,
  MyCare,
  PathologyQueueItem,
  QualityMetrics,
  SearchResults,
  UpdateEscortPayload,
  UpdatePrepItemPayload,
  WhiteboardBoard,
  WhiteboardCard,
  WorkItem,
} from "@asc/types";
import { http, HttpResponse } from "msw";
import { buildPrepChecklist } from "../../db/content";
import { AGENT_SETTINGS, BLOCKS, PORTAL_PATIENT_BY_USER, ROOMS, STAFF_LIST } from "../../db/staff";
import { actorFrom, audit, db, resetDb, roomsNow, userIdFrom } from "../../db/store";
import { apiUrl } from "../api-url";
import { searchPatients } from "./patients";
import { apiError, body, latency, notFound, param } from "./respond";

const PRIORITY_RANK: Readonly<Record<WorkItem["priority"], number>> = { high: 0, normal: 1, low: 2 };
const SEARCH_LIMIT = 8;
const BENCHMARKS = { adr: 0.3, cir: 0.95, withdrawalMin: 6, bbpsAdequate: 0.85 } as const;

function todaysCases() {
  const today = toIsoDate(new Date());
  return [...db().cases.values()].filter((item) => toIsoDate(new Date(item.scheduledStart)) === today);
}

function whiteboardCard(caseId: string): WhiteboardCard | null {
  const state = db();
  const item = state.cases.get(caseId);
  const patient = item && state.patients.get(item.patientId);
  if (!item || !patient) return null;
  const flags: WhiteboardCard["flags"][number][] = [
    ...(patient.allergies.length > 0 ? (["allergy"] as const) : []),
    ...(patient.medications.some((med) => med.medClass === "anticoagulant" || med.medClass === "antiplatelet") ? (["anticoagulant"] as const) : []),
    ...(!patient.escort?.confirmed ? (["escort_missing"] as const) : []),
    ...(patient.coverage?.eligibility?.status !== "active" ? (["eligibility"] as const) : []),
  ];
  return {
    caseId: item.id,
    caseNumber: item.caseNumber,
    initials: item.patient.initials,
    phase: item.phase,
    roomId: item.roomId,
    procedureLabel: item.procedureLabel,
    scheduledStart: item.scheduledStart,
    phaseEnteredAt: item.timestamps[item.phase],
    surgeonInitials: item.team.surgeon.initials,
    flags,
  };
}

function qualityMetrics(): QualityMetrics {
  const history = db().quality;
  const total = history.reduce((sum, point) => sum + point.cases, 0);
  const weighted = (key: "adr" | "cir" | "withdrawalMin" | "bbpsAdequate" | "turnaroundMin") =>
    Math.round((history.reduce((sum, point) => sum + point[key] * point.cases, 0) / Math.max(1, total)) * 1000) / 1000;
  const surgeons = STAFF_LIST.filter((member) => member.role === "SURGEON");
  return {
    from: history[0]?.date ?? toIsoDate(new Date()),
    to: history.at(-1)?.date ?? toIsoDate(new Date()),
    current: {
      cases: total,
      adr: weighted("adr"),
      cir: weighted("cir"),
      withdrawalMin: weighted("withdrawalMin"),
      bbpsAdequate: weighted("bbpsAdequate"),
      turnaroundMin: weighted("turnaroundMin"),
    },
    benchmarks: BENCHMARKS,
    history,
    byProvider: surgeons.map((member, index) => ({
      provider: { id: member.id, name: member.name, initials: member.initials },
      cases: Math.round(total / surgeons.length) + index * 7,
      adr: Math.round((weighted("adr") + (index - 1) * 0.04) * 1000) / 1000,
      cir: Math.min(0.99, Math.round((weighted("cir") + (1 - index) * 0.01) * 1000) / 1000),
      withdrawalMin: Math.round((weighted("withdrawalMin") + (index - 1) * 0.8) * 10) / 10,
    })),
  };
}

function myCareFor(patientId: string): MyCare | null {
  const state = db();
  const patient = state.patients.get(patientId);
  if (!patient) return null;
  const cases = [...state.cases.values()]
    .filter((item) => item.patientId === patientId && !STOPPED_PHASES.includes(item.phase))
    .sort((a, b) => Date.parse(b.scheduledStart) - Date.parse(a.scheduledStart));
  const current = cases[0] ?? null;
  if (current && !state.prep.has(patientId)) state.prep.set(patientId, buildPrepChecklist(current, patient, new Date().toISOString()));
  const instructions = current ? (state.discharge.get(current.id) ?? null) : null;
  return {
    patient,
    case: current,
    prep: state.prep.get(patientId) ?? [],
    instructions: instructions?.status === "approved" ? instructions : null,
    letters: cases.flatMap((item) => state.letters.get(item.id) ?? []).filter((letter) => letter.recipient === "patient"),
    surveillance: current ? (state.surveillance.get(current.id) ?? null) : null,
  };
}

function portalPatientId(request: Request): string | undefined {
  const userId = userIdFrom(request);
  return userId ? PORTAL_PATIENT_BY_USER[userId] : undefined;
}

export const centerHandlers = [
  http.get(apiUrl(P.worklist), async ({ request }) => {
    await latency();
    const params = new URL(request.url).searchParams;
    const [type, role, status] = [params.get("type"), params.get("role"), params.get("status")];
    const items = db()
      .workItems.filter((item) => (!type || item.type === type) && (!role || item.ownerRole === role) && (!status || item.status === status))
      .sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || Date.parse(a.dueAt) - Date.parse(b.dueAt));
    return HttpResponse.json(items);
  }),

  http.post(apiUrl(P.workItemComplete), async ({ params, request }) => {
    await latency();
    const state = db();
    const itemId = param(params.itemId);
    const item = state.workItems.find((candidate) => candidate.id === itemId);
    if (!item) return notFound("Work item");
    const done: WorkItem = { ...item, status: "done", completedAt: new Date().toISOString() };
    state.workItems = state.workItems.map((candidate) => (candidate.id === itemId ? done : candidate));
    audit(actorFrom(request), "workitem.complete", { type: "WorkItem", id: itemId }, `Completed ${item.type}`);
    return HttpResponse.json(done);
  }),

  http.get(apiUrl(P.whiteboard), async () => {
    await latency();
    const board: WhiteboardBoard = {
      generatedAt: new Date().toISOString(),
      rooms: roomsNow(),
      cards: todaysCases()
        .map((item) => whiteboardCard(item.id))
        .filter((card): card is WhiteboardCard => card !== null)
        .sort((a, b) => Date.parse(a.scheduledStart) - Date.parse(b.scheduledStart)),
    };
    return HttpResponse.json(board);
  }),

  http.get(apiUrl(P.quality), async () => {
    await latency();
    return HttpResponse.json(qualityMetrics());
  }),

  http.get(apiUrl(P.audit), async ({ request }) => {
    await latency();
    const params = new URL(request.url).searchParams;
    const filters: readonly ((event: AuditEvent) => boolean)[] = [
      (event) => !params.get("action") || event.action.startsWith(params.get("action") ?? ""),
      (event) => !params.get("role") || event.actor.role === params.get("role"),
      (event) => !params.get("entityType") || event.entity.type === params.get("entityType"),
      (event) => !params.get("entityId") || event.entity.id === params.get("entityId"),
      (event) => !params.get("outcome") || event.outcome === params.get("outcome"),
    ];
    return HttpResponse.json(db().audit.filter((event) => filters.every((filter) => filter(event))));
  }),

  http.get(apiUrl(P.admin), async () => {
    await latency();
    const overview: AdminOverview = { staff: STAFF_LIST, rooms: ROOMS, blocks: BLOCKS, agents: AGENT_SETTINGS };
    return HttpResponse.json(overview);
  }),

  http.get(apiUrl(P.dashboardSummary), async () => {
    await latency();
    const state = db();
    const today = todaysCases();
    const phaseCounts = today.reduce<Partial<Record<string, number>>>((counts, item) => ({ ...counts, [item.phase]: (counts[item.phase] ?? 0) + 1 }), {});
    const started = today.filter((item) => item.timestamps.IN_PROCEDURE);
    const onTime = started.filter((item) => Date.parse(item.timestamps.IN_PROCEDURE ?? "") - Date.parse(item.scheduledStart) <= 5 * 60_000);
    const summary: DashboardSummary = {
      date: toIsoDate(new Date()),
      casesToday: today.filter((item) => !STOPPED_PHASES.includes(item.phase)).length,
      phaseCounts,
      inRoom: today.filter((item) => item.phase === "IN_PROCEDURE").length,
      inRecovery: today.filter((item) => item.phase === "RECOVERY" || item.phase === "READY_FOR_DISCHARGE").length,
      pendingSignatures: [...state.notes.values()].filter((note) => note.status === "draft").length,
      openWorkItems: state.workItems.filter((item) => item.status === "open").length,
      pendingPathology: [...state.specimens.values()].flat().filter((specimen) => specimen.pathologyStatus === "pending").length,
      adr30d: qualityMetrics().current.adr,
      onTimeStartRate: started.length > 0 ? Math.round((onTime.length / started.length) * 100) / 100 : 1,
    };
    return HttpResponse.json(summary);
  }),

  http.get(apiUrl(P.search), async ({ request }) => {
    await latency();
    const q = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase();
    const cases = [...db().cases.values()]
      .filter((item) => [item.caseNumber, item.patient.displayName, item.procedureLabel].some((value) => value.toLowerCase().includes(q)))
      .sort((a, b) => Date.parse(b.scheduledStart) - Date.parse(a.scheduledStart))
      .slice(0, SEARCH_LIMIT);
    const results: SearchResults = { patients: searchPatients(q).slice(0, SEARCH_LIMIT), cases };
    return HttpResponse.json(results);
  }),

  http.get(apiUrl(P.pathologyQueue), async () => {
    await latency();
    const state = db();
    const items: PathologyQueueItem[] = [...state.cases.values()]
      .filter((item) => isPhaseAtLeast(item.phase, "RECOVERY") && (state.specimens.get(item.id)?.length ?? 0) > 0)
      .map((item): PathologyQueueItem => {
        const specimens = state.specimens.get(item.id) ?? [];
        const resulted = specimens.filter((specimen) => specimen.pathologyStatus !== "pending").length;
        const reconciled = specimens.every((specimen) => specimen.pathologyStatus === "reconciled");
        return {
          caseId: item.id,
          caseNumber: item.caseNumber,
          patient: item.patient,
          procedureDate: item.scheduledStart,
          surgeon: item.team.surgeon,
          specimenCount: specimens.length,
          resultedCount: resulted,
          status: reconciled ? "reconciled" : resulted < specimens.length ? "awaiting" : "received",
        };
      })
      .sort((a, b) => Date.parse(b.procedureDate) - Date.parse(a.procedureDate));
    return HttpResponse.json(items);
  }),

  http.get(apiUrl(P.codingQueue), async () => {
    await latency();
    const state = db();
    const items: CodingQueueItem[] = [...state.coding.values()]
      .map((coding) => {
        const item = state.cases.get(coding.caseId);
        if (!item) return null;
        return {
          caseId: item.id,
          caseNumber: item.caseNumber,
          patient: item.patient,
          procedureLabel: item.procedureLabel,
          procedureDate: item.scheduledStart,
          phase: item.phase,
          status: coding.status,
          suggestionCount: coding.suggestions.length,
          lowConfidenceCount: coding.suggestions.filter((suggestion) => suggestion.confidence < 0.75).length,
        };
      })
      .filter((item): item is CodingQueueItem => item !== null)
      .sort((a, b) => Date.parse(b.procedureDate) - Date.parse(a.procedureDate));
    return HttpResponse.json(items);
  }),

  // ─── Patient portal ───────────────────────────────────────────────────────
  http.get(apiUrl(P.portalMyCare), async ({ request }) => {
    await latency();
    const patientId = portalPatientId(request);
    const care = patientId ? myCareFor(patientId) : null;
    return care ? HttpResponse.json(care) : apiError(403, "PORTAL_FORBIDDEN", "Sign in as a patient to view My care.");
  }),

  http.post(apiUrl(P.portalPrep), async ({ request }) => {
    await latency();
    const patientId = portalPatientId(request);
    if (!patientId) return apiError(403, "PORTAL_FORBIDDEN", "Sign in as a patient.");
    const payload = await body<UpdatePrepItemPayload>(request);
    const state = db();
    myCareFor(patientId);
    state.prep.set(patientId, (state.prep.get(patientId) ?? []).map((item) => (item.id === payload.itemId ? { ...item, done: payload.done } : item)));
    return HttpResponse.json(myCareFor(patientId));
  }),

  http.put(apiUrl(P.portalEscort), async ({ request }) => {
    await latency();
    const patientId = portalPatientId(request);
    const state = db();
    const patient = patientId ? state.patients.get(patientId) : undefined;
    if (!patientId || !patient) return apiError(403, "PORTAL_FORBIDDEN", "Sign in as a patient.");
    const escort = await body<UpdateEscortPayload>(request);
    state.patients.set(patientId, { ...patient, escort: { ...escort, present: patient.escort?.present ?? false } });
    audit(actorFrom(request), "portal.escort.update", { type: "Patient", id: patientId }, "Patient updated escort");
    return HttpResponse.json(myCareFor(patientId));
  }),

  // ─── Demo ─────────────────────────────────────────────────────────────────
  http.post(apiUrl(P.demoReset), async ({ request }) => {
    await latency();
    resetDb();
    audit(actorFrom(request), "demo.reset", { type: "Demo", id: "db" }, "Demo data re-seeded");
    return new HttpResponse(null, { status: 204 });
  }),
];
