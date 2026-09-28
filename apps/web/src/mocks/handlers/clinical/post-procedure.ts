import { aldreteTotal, fromChecks, surveillanceInterval, toIsoDate, transitionGate } from "@asc/clinical-rules";
import { API_ROUTE_PATTERNS as P } from "@asc/config/api";
import type {
  CaseCoding,
  CasePathology,
  ChargeExport,
  DischargeCasePayload,
  ExportChargesPayload,
  PathologyResult,
  RecordPathologyPayload,
  ReconcilePathologyPayload,
  SaveAldretePayload,
  SendResultLetterPayload,
  SetSurveillancePayload,
  UpdateCodingStatusPayload,
} from "@asc/types";
import { http, HttpResponse } from "msw";
import { chargeLinesFrom } from "../../db/coding-builder";
import { buildDischargeInstructions } from "../../db/content";
import { actorFrom, addWorkItem, audit, autoAdvance, caseDetail, completeWorkItems, db, getCaseOrNull, setPhase } from "../../db/store";
import { newId } from "../../db/util";
import { apiUrl } from "../api-url";
import { apiError, body, detailResponse, gateFailed, latency, notFound, param } from "./respond";

const ADENOMA_HISTOLOGY: readonly PathologyResult["histology"][] = ["tubular_adenoma", "tubulovillous_adenoma", "villous_adenoma"];

function codingOf(caseId: string): CaseCoding {
  return db().coding.get(caseId) ?? { caseId, status: "not_ready", suggestions: [], provenance: null };
}

function pathologyOf(caseId: string): CasePathology {
  const state = db();
  const results = state.pathology.get(caseId) ?? [];
  return {
    caseId,
    specimens: state.specimens.get(caseId) ?? [],
    results,
    recommendation: results.length > 0 ? surveillanceInterval(results) : null,
    surveillance: state.surveillance.get(caseId) ?? null,
    letters: state.letters.get(caseId) ?? [],
  };
}

export const postProcedureHandlers = [
  // ─── Recovery & discharge ─────────────────────────────────────────────────
  http.post(apiUrl(P.caseAldrete), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const current = getCaseOrNull(caseId);
    if (!current) return notFound("Case");
    if (current.phase !== "RECOVERY" && current.phase !== "READY_FOR_DISCHARGE") {
      return apiError(409, "INVALID_PHASE", "Aldrete is scored in recovery.");
    }
    const input = await body<SaveAldretePayload>(request);
    const actor = actorFrom(request);
    const total = aldreteTotal(input);
    db().aldrete.set(caseId, { ...input, caseId, total, recordedAt: new Date().toISOString(), recordedBy: actor.ref });
    audit(actor, "aldrete.record", { type: "ProcedureCase", id: caseId }, `Aldrete ${total}/10`);
    return detailResponse(caseId);
  }),

  http.post(apiUrl(P.caseDischargeInstructions), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const detail = caseDetail(caseId);
    if (!detail) return notFound("Case");
    const instructions = buildDischargeInstructions(detail.case, detail.patient, detail.specimens, new Date().toISOString());
    db().discharge.set(caseId, instructions);
    audit(actorFrom(request), "discharge.instructions.generate", { type: "ProcedureCase", id: caseId }, `AI draft (${instructions.provenance.promptVersion})`);
    return HttpResponse.json(instructions);
  }),

  http.post(apiUrl(P.caseDischargeInstructionsApprove), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const state = db();
    const current = state.discharge.get(caseId);
    if (!current) return notFound("Discharge instructions");
    const actor = actorFrom(request);
    const approved = { ...current, status: "approved" as const, approvedBy: actor.ref, approvedAt: new Date().toISOString() };
    state.discharge.set(caseId, approved);
    audit(actor, "discharge.instructions.approve", { type: "ProcedureCase", id: caseId }, "Discharge instructions approved");
    return HttpResponse.json(approved);
  }),

  http.post(apiUrl(P.caseDischarge), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const state = db();
    const current = getCaseOrNull(caseId);
    const patient = current && state.patients.get(current.patientId);
    if (!current || !patient) return notFound("Case");
    const { escortPresent } = await body<DischargeCasePayload>(request);
    if (patient.escort) state.patients.set(patient.id, { ...patient, escort: { ...patient.escort, present: escortPresent } });
    const detail = caseDetail(caseId);
    if (!detail) return notFound("Case");
    const actor = actorFrom(request);
    const gate = transitionGate(detail, "DISCHARGED");
    if (!gate.ok) {
      audit(actor, "case.discharge", { type: "ProcedureCase", id: caseId }, `Discharge blocked (${gate.reasons[0]?.code ?? "rule"})`, "denied");
      return gateFailed(gate);
    }
    setPhase(caseId, "DISCHARGED", actor);
    autoAdvance(caseId, actor);
    return detailResponse(caseId);
  }),

  // ─── Coding & charges ─────────────────────────────────────────────────────
  http.get(apiUrl(P.caseCoding), async ({ params }) => {
    await latency();
    return HttpResponse.json(codingOf(param(params.caseId)));
  }),

  http.post(apiUrl(P.caseCodingStatus), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const coding = codingOf(caseId);
    if (coding.status === "attested" || coding.status === "exported") return apiError(409, "CODING_LOCKED", "Coding is attested; changes need a correction workflow.");
    const payload = await body<UpdateCodingStatusPayload>(request);
    if (!coding.suggestions.some((item) => item.id === payload.suggestionId)) return notFound("Suggestion");
    const updated: CaseCoding = {
      ...coding,
      suggestions: coding.suggestions.map((item) =>
        item.id === payload.suggestionId
          ? { ...item, status: payload.status, ...(payload.code ? { code: payload.code } : {}), ...(payload.description ? { description: payload.description } : {}) }
          : item,
      ),
    };
    db().coding.set(caseId, updated);
    audit(actorFrom(request), "coding.review", { type: "CodingSuggestion", id: payload.suggestionId }, `Suggestion ${payload.status}`);
    return HttpResponse.json(updated);
  }),

  http.post(apiUrl(P.caseCodingAttest), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const coding = codingOf(caseId);
    const noteSigned = db().notes.get(caseId)?.status === "signed";
    const unreviewed = coding.suggestions.filter((item) => item.status === "suggested").length;
    const gate = fromChecks([
      { code: "NOTE_SIGNED", label: "Procedure note signed", ok: noteSigned, message: "The procedure note must be signed before coding is attested." },
      { code: "CODES_PRESENT", label: "Codes present", ok: coding.suggestions.length > 0, message: "No codes to attest." },
      { code: "ALL_REVIEWED", label: "Every suggestion reviewed", ok: unreviewed === 0, message: `${unreviewed} suggestion(s) still need accept / reject.` },
      { code: "NOT_ATTESTED", label: "Not yet attested", ok: coding.status === "in_review" || coding.status === "not_ready", message: "Coding is already attested." },
    ]);
    const actor = actorFrom(request);
    if (!gate.ok) return gateFailed(gate);
    const updated: CaseCoding = { ...coding, status: "attested", attestedBy: actor.ref, attestedAt: new Date().toISOString() };
    db().coding.set(caseId, updated);
    completeWorkItems((item) => item.caseId === caseId && item.type === "coding");
    audit(actor, "coding.attest", { type: "ProcedureCase", id: caseId }, `Coder attested ${coding.suggestions.filter((s) => s.status !== "rejected").length} code(s)`);
    autoAdvance(caseId, actor);
    return HttpResponse.json(updated);
  }),

  http.post(apiUrl(P.caseChargesExport), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const coding = codingOf(caseId);
    if (coding.status !== "attested") return apiError(409, coding.status === "exported" ? "CHARGES_ALREADY_EXPORTED" : "CODING_NOT_ATTESTED", coding.status === "exported" ? "Charges were already exported." : "Attest coding before exporting charges.");
    const { format } = await body<ExportChargesPayload>(request);
    const lines = chargeLinesFrom(coding.suggestions);
    const exported: ChargeExport = {
      id: newId("chg"),
      caseId,
      format,
      lines,
      totalCents: lines.reduce((sum, line) => sum + line.chargeCents, 0),
      createdAt: new Date().toISOString(),
      status: "sent",
      batchId: newId("BATCH"),
    };
    db().coding.set(caseId, { ...coding, status: "exported", export: exported });
    const actor = actorFrom(request);
    audit(actor, "charges.export", { type: "ChargeExport", id: exported.id }, `${format} with ${lines.length} line(s)`);
    autoAdvance(caseId, actor);
    return HttpResponse.json(exported);
  }),

  // ─── Pathology & surveillance ─────────────────────────────────────────────
  http.get(apiUrl(P.casePathology), async ({ params }) => {
    await latency();
    const caseId = param(params.caseId);
    return getCaseOrNull(caseId) ? HttpResponse.json(pathologyOf(caseId)) : notFound("Case");
  }),

  http.post(apiUrl(P.casePathologyResults), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const state = db();
    const payload = await body<RecordPathologyPayload>(request);
    const specimens = state.specimens.get(caseId) ?? [];
    const specimen = specimens.find((item) => item.id === payload.specimenId);
    if (!specimen) return notFound("Specimen");
    const result: PathologyResult = {
      id: newId("pth"),
      caseId,
      specimenId: specimen.id,
      status: "received",
      receivedAt: new Date().toISOString(),
      histology: payload.histology,
      dysplasia: payload.dysplasia,
      isAdenoma: ADENOMA_HISTOLOGY.includes(payload.histology),
      sizeMm: specimen.sizeMm,
      diagnosis: payload.diagnosis,
      reportText: `Specimen ${specimen.jar}: ${payload.diagnosis}.`,
    };
    state.pathology.set(caseId, [...(state.pathology.get(caseId) ?? []).filter((item) => item.specimenId !== specimen.id), result]);
    const nextSpecimens = specimens.map((item) => (item.id === specimen.id ? { ...item, pathologyStatus: "resulted" as const } : item));
    state.specimens.set(caseId, nextSpecimens);
    if (nextSpecimens.every((item) => item.pathologyStatus !== "pending")) {
      completeWorkItems((item) => item.caseId === caseId && item.type === "pending_pathology");
      addWorkItem({
        type: "result_letter",
        title: `Result letter — ${getCaseOrNull(caseId)?.caseNumber ?? caseId}`,
        detail: "All pathology received; reconcile, set surveillance and send letters.",
        ownerRole: "SURGEON",
        priority: "normal",
        dueAt: new Date(Date.now() + 2 * 24 * 3_600_000).toISOString(),
        caseId,
      });
    }
    audit(actorFrom(request), "pathology.result", { type: "PathologyResult", id: result.id }, `Result received for jar ${specimen.jar}`);
    return HttpResponse.json(pathologyOf(caseId));
  }),

  http.post(apiUrl(P.casePathologyReconcile), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const state = db();
    const payload = await body<ReconcilePathologyPayload>(request);
    const results = state.pathology.get(caseId) ?? [];
    const result = results.find((item) => item.id === payload.resultId);
    if (!result) return notFound("Result");
    state.pathology.set(
      caseId,
      results.map((item) => (item.id === result.id ? { ...item, status: "reconciled", reconciledFindingId: payload.findingId ?? `fnd_${item.specimenId}` } : item)),
    );
    state.specimens.set(
      caseId,
      (state.specimens.get(caseId) ?? []).map((item) => (item.id === result.specimenId ? { ...item, pathologyStatus: "reconciled" as const } : item)),
    );
    audit(actorFrom(request), "pathology.reconcile", { type: "PathologyResult", id: result.id }, "Result reconciled to finding");
    return HttpResponse.json(pathologyOf(caseId));
  }),

  http.put(apiUrl(P.caseSurveillance), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const current = getCaseOrNull(caseId);
    if (!current) return notFound("Case");
    const payload = await body<SetSurveillancePayload>(request);
    if (!(payload.intervalYears > 0)) return apiError(400, "VALIDATION_FAILED", "Interval must be a positive number of years.");
    const actor = actorFrom(request);
    const due = new Date(current.scheduledStart);
    due.setFullYear(due.getFullYear() + payload.intervalYears);
    db().surveillance.set(caseId, {
      intervalYears: payload.intervalYears,
      rationale: payload.rationale,
      guideline: pathologyOf(caseId).recommendation?.guideline ?? "USMSTF 2020",
      dueDate: toIsoDate(due),
      setBy: actor.ref,
      setAt: new Date().toISOString(),
    });
    audit(actor, "surveillance.set", { type: "ProcedureCase", id: caseId }, `Surveillance ${payload.intervalYears} y`);
    return HttpResponse.json(pathologyOf(caseId));
  }),

  http.post(apiUrl(P.caseLetters), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    if (!getCaseOrNull(caseId)) return notFound("Case");
    const payload = await body<SendResultLetterPayload>(request);
    const state = db();
    const pathology = pathologyOf(caseId);
    const interval = pathology.surveillance?.intervalYears ?? pathology.recommendation?.intervalYears;
    const letter = {
      id: newId("ltr"),
      caseId,
      recipient: payload.recipient,
      channel: payload.channel,
      sentAt: new Date().toISOString(),
      summary: `${pathology.results.some((r) => r.isAdenoma) ? "Precancerous polyp(s) removed" : "Benign findings"}.${interval ? ` Next colonoscopy in ${interval} years.` : ""}`,
    };
    state.letters.set(caseId, [...(state.letters.get(caseId) ?? []), letter]);
    if (payload.recipient === "patient") completeWorkItems((item) => item.caseId === caseId && item.type === "result_letter");
    audit(actorFrom(request), "letter.send", { type: "ResultLetter", id: letter.id }, `Result letter to ${payload.recipient} via ${payload.channel}`);
    return HttpResponse.json(pathologyOf(caseId));
  }),
];
