import { findScheduleConflicts, TIME_OUT_ROLES, toIsoDate, transitionGate } from "@asc/clinical-rules";
import { API_ROUTE_PATTERNS as P } from "@asc/config/api";
import type {
  AddImagePayload,
  AddProcedureEventPayload,
  AddSpecimenPayload,
  AnesthesiaEntryPayload,
  AnesthesiaRecord,
  AttestTimeOutPayload,
  BbpsScore,
  BookCasePayload,
  CheckInPayload,
  HpAssessment,
  ProcedureCase,
  ProcedureEventType,
  SaveHpPayload,
  SavePreOpPayload,
  SaveVitalsPayload,
  ScheduleDay,
  SignConsentPayload,
  TransitionCasePayload,
} from "@asc/types";
import { http, HttpResponse } from "msw";
import { buildPreVisitBrief } from "../../db/content";
import { PROCEDURE_LABEL } from "../../db/seed";
import { ROOMS, STAFF_LIST } from "../../db/staff";
import {
  actorFrom,
  addWorkItem,
  audit,
  autoAdvance,
  caseDetail,
  completeWorkItems,
  db,
  getCaseOrNull,
  refreshReadiness,
  roomsNow,
  setPhase,
  updateCase,
} from "../../db/store";
import { newId, patientRef, staffRef } from "../../db/util";
import { apiUrl } from "../api-url";
import { apiError, body, detailResponse, gateFailed, latency, notFound, param } from "./respond";

/** Events that may be recorded once per case. */
const SINGLE_EVENTS: readonly ProcedureEventType[] = [
  "SEDATION_START",
  "SCOPE_IN",
  "CECUM_REACHED",
  "TERMINAL_ILEUM",
  "WITHDRAWAL_START",
  "SCOPE_OUT",
  "SEDATION_END",
];

const JARS = "ABCDEFGHIJ";

function casesOn(date: string): ProcedureCase[] {
  return [...db().cases.values()]
    .filter((item) => toIsoDate(new Date(item.scheduledStart)) === date)
    .sort((a, b) => Date.parse(a.scheduledStart) - Date.parse(b.scheduledStart));
}

function nextCaseNumber(): string {
  const numbers = [...db().cases.values()].map((item) => Number(item.caseNumber.split("-")[2] ?? 0));
  return `C-${new Date().getFullYear() % 100}-${String(Math.max(0, ...numbers) + 1).padStart(4, "0")}`;
}

function requirePhase(caseId: string, allowed: readonly ProcedureCase["phase"][], action: string) {
  const current = getCaseOrNull(caseId);
  if (!current) return notFound("Case");
  if (!allowed.includes(current.phase)) {
    return apiError(409, "INVALID_PHASE", `Cannot ${action} while the case is ${current.phase.toLowerCase().replaceAll("_", " ")}.`);
  }
  return null;
}

function applyAnesthesiaEntry(record: AnesthesiaRecord, payload: AnesthesiaEntryPayload, actor: ReturnType<typeof actorFrom>): AnesthesiaRecord {
  const now = new Date().toISOString();
  switch (payload.kind) {
    case "dose":
      return {
        ...record,
        doses: [...record.doses, { id: newId("dose"), drug: payload.drug, amount: payload.amount, unit: payload.unit, route: "IV", at: payload.at ?? now, by: actor.ref }],
      };
    case "vitals":
      return {
        ...record,
        vitals: [
          ...record.vitals,
          { ...payload.vitals, id: newId("vit"), caseId: record.caseId, context: "intra", recordedAt: payload.vitals.recordedAt ?? now, recordedBy: actor.ref },
        ],
      };
    case "airway_event":
      return { ...record, airwayEvents: [...record.airwayEvents, { id: newId("air"), type: payload.type, at: now, ...(payload.note ? { note: payload.note } : {}) }] };
    case "sedation":
      return payload.edge === "start" ? { ...record, sedationStart: now } : { ...record, sedationEnd: now };
    case "setup":
      return {
        ...record,
        technique: payload.technique ?? record.technique,
        airway: { device: payload.device ?? record.airway.device, o2Lpm: payload.o2Lpm ?? record.airway.o2Lpm },
      };
  }
}

export const caseHandlers = [
  // ─── Schedule ─────────────────────────────────────────────────────────────
  http.get(apiUrl(P.schedule), async ({ request }) => {
    await latency();
    const date = new URL(request.url).searchParams.get("date") ?? toIsoDate(new Date());
    const isToday = date === toIsoDate(new Date());
    const day: ScheduleDay = { date, rooms: isToday ? roomsNow() : ROOMS, cases: casesOn(date) };
    return HttpResponse.json(day);
  }),

  http.post(apiUrl(P.scheduleConflicts), async ({ request }) => {
    await latency();
    return HttpResponse.json(findScheduleConflicts([...db().cases.values()], await body<BookCasePayload>(request)));
  }),

  http.post(apiUrl(P.cases), async ({ request }) => {
    await latency();
    const state = db();
    const payload = await body<BookCasePayload>(request);
    const patient = state.patients.get(payload.patientId);
    if (!patient) return notFound("Patient");
    const staff = (id: string) => STAFF_LIST.find((member) => member.id === id);
    const [surgeon, anesthesia, nurse] = [staff(payload.surgeonId), staff(payload.anesthesiaId), staff(payload.nurseId)];
    if (!surgeon || !anesthesia || !nurse) return apiError(400, "VALIDATION_FAILED", "Choose a surgeon, anesthesia provider and nurse.");
    const conflicts = findScheduleConflicts([...state.cases.values()], payload);
    if (!conflicts.ok) {
      return apiError(409, "SCHEDULE_CONFLICT", conflicts.reasons[0]?.message ?? "Schedule conflict", Object.fromEntries(conflicts.conflicts.map((c) => [c.kind, c.message])));
    }
    const actor = actorFrom(request);
    const id = newId("case");
    const eligibilityActive = patient.coverage?.eligibility?.status === "active";
    const procedureCase: ProcedureCase = {
      id,
      caseNumber: nextCaseNumber(),
      patientId: patient.id,
      patient: patientRef(patient),
      procedure: payload.procedure,
      procedureLabel: PROCEDURE_LABEL[payload.procedure],
      intent: payload.intent,
      indication: payload.indication,
      roomId: payload.roomId,
      scheduledStart: payload.scheduledStart,
      durationMin: payload.durationMin,
      team: { surgeon: staffRef(surgeon), anesthesia: staffRef(anesthesia), nurse: staffRef(nurse) },
      phase: "SCHEDULED",
      timestamps: { SCHEDULED: new Date().toISOString() },
      readiness: {
        prepConfirmed: false,
        eligibilityActive,
        hpCurrent: false,
        asaSet: false,
        consentsSigned: false,
        holdsConfirmed: false,
        escortConfirmed: patient.escort?.confirmed ?? false,
        npoConfirmed: false,
        ivPlaced: false,
        timeOutComplete: false,
      },
    };
    state.cases.set(id, procedureCase);
    const hp: HpAssessment = {
      caseId: id,
      status: "draft",
      asa: null,
      mallampati: null,
      airwayNotes: "",
      heart: "",
      lungs: "",
      intervalHistory: "",
      holdsReviewed: false,
      brief: buildPreVisitBrief(procedureCase, patient, new Date().toISOString()),
    };
    state.hp.set(id, hp);
    state.consents.set(id, [
      { id: newId("cns"), caseId: id, kind: "procedure", title: `${procedureCase.procedureLabel} consent`, summary: "Bleeding, perforation, infection, missed lesions; alternatives discussed.", status: "pending" },
      { id: newId("cns"), caseId: id, kind: "sedation", title: "Anesthesia / sedation consent", summary: "Monitored anesthesia care with propofol; airway risks discussed.", status: "pending" },
    ]);
    if (payload.referralId) {
      const referral = state.referrals.get(payload.referralId);
      if (referral) state.referrals.set(referral.id, { ...referral, caseId: id, patientId: patient.id, status: "converted" });
      completeWorkItems((item) => item.referralId === payload.referralId);
    }
    if (!eligibilityActive) {
      addWorkItem({
        type: "eligibility_failed",
        title: `Verify eligibility — ${procedureCase.caseNumber}`,
        detail: "No active 271 on file for this booking.",
        ownerRole: "ADMIN",
        priority: "normal",
        dueAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
        caseId: id,
        patientId: patient.id,
      });
    }
    audit(actor, "case.book", { type: "ProcedureCase", id }, `Booked ${procedureCase.caseNumber} (${procedureCase.procedureLabel}, ${payload.intent})`);
    return HttpResponse.json(procedureCase, { status: 201 });
  }),

  // ─── Case workspace ───────────────────────────────────────────────────────
  http.get(apiUrl(P.case), async ({ params }) => {
    await latency();
    return detailResponse(param(params.caseId));
  }),

  http.post(apiUrl(P.caseTransition), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const detail = caseDetail(caseId);
    if (!detail) return notFound("Case");
    const { to, reason } = await body<TransitionCasePayload>(request);
    const actor = actorFrom(request);
    const result = transitionGate(detail, to);
    if (!result.ok) {
      audit(actor, "case.transition", { type: "ProcedureCase", id: caseId }, `${detail.case.caseNumber} → ${to} blocked (${result.reasons[0]?.code ?? "rule"})`, "denied");
      return gateFailed(result);
    }
    setPhase(caseId, to, actor, reason);
    if (to === "READY_FOR_PROCEDURE") completeWorkItems((item) => item.caseId === caseId && item.type === "med_hold_review");
    autoAdvance(caseId, actor);
    return detailResponse(caseId);
  }),

  http.post(apiUrl(P.caseCheckIn), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const blocked = requirePhase(caseId, ["CONFIRMED"], "check in");
    if (blocked) return blocked;
    const payload = await body<CheckInPayload>(request);
    const state = db();
    const current = getCaseOrNull(caseId);
    const patient = current && state.patients.get(current.patientId);
    if (!current || !patient) return notFound("Case");
    if (patient.escort) state.patients.set(patient.id, { ...patient, escort: { ...patient.escort, present: payload.escortPresent, confirmed: patient.escort.confirmed || payload.escortPresent } });
    updateCase(caseId, { readiness: { ...current.readiness, npoConfirmed: payload.npoConfirmed } });
    setPhase(caseId, "ARRIVED", actorFrom(request));
    refreshReadiness(caseId);
    return detailResponse(caseId);
  }),

  http.put(apiUrl(P.caseHp), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const state = db();
    const current = getCaseOrNull(caseId);
    const patient = current && state.patients.get(current.patientId);
    if (!current || !patient) return notFound("Case");
    const { sign, holdDecisions, ...fields } = await body<SaveHpPayload>(request);
    const actor = actorFrom(request);
    const existing: HpAssessment = state.hp.get(caseId) ?? {
      caseId,
      status: "draft",
      asa: null,
      mallampati: null,
      airwayNotes: "",
      heart: "",
      lungs: "",
      intervalHistory: "",
      holdsReviewed: false,
      brief: null,
    };
    if (existing.status === "signed" && !sign) return apiError(409, "HP_SIGNED", "The H&P is signed; addenda are not supported in the demo.");
    const decisions = new Map((holdDecisions ?? []).map((decision) => [decision.medicationId, decision.holdStatus]));
    state.patients.set(patient.id, {
      ...patient,
      medications: patient.medications.map((med) => ({ ...med, holdStatus: decisions.get(med.id) ?? med.holdStatus })),
    });
    const next: HpAssessment = { ...existing, ...fields, performedBy: actor.ref, performedAt: new Date().toISOString() };
    if (sign && next.asa == null) return apiError(422, "GATE_FAILED", "Record the ASA class before signing.", { ASA_SET: "Record the ASA class before signing." });
    state.hp.set(caseId, sign ? { ...next, status: "signed", signedAt: new Date().toISOString() } : next);
    if (next.holdsReviewed) completeWorkItems((item) => item.caseId === caseId && item.type === "med_hold_review");
    audit(actor, sign ? "hp.sign" : "hp.save", { type: "HpAssessment", id: caseId }, sign ? "H&P signed" : "H&P updated");
    refreshReadiness(caseId);
    return detailResponse(caseId);
  }),

  http.patch(apiUrl(P.casePreOp), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const state = db();
    const current = getCaseOrNull(caseId);
    const patient = current && state.patients.get(current.patientId);
    if (!current || !patient) return notFound("Case");
    const payload = await body<SavePreOpPayload>(request);
    if (patient.escort && (payload.escortConfirmed !== undefined || payload.escortPresent !== undefined)) {
      state.patients.set(patient.id, {
        ...patient,
        escort: { ...patient.escort, confirmed: payload.escortConfirmed ?? patient.escort.confirmed, present: payload.escortPresent ?? patient.escort.present },
      });
    }
    updateCase(caseId, {
      readiness: {
        ...current.readiness,
        npoConfirmed: payload.npoConfirmed ?? current.readiness.npoConfirmed,
        ivPlaced: payload.ivPlaced ?? current.readiness.ivPlaced,
        prepConfirmed: payload.prepConfirmed ?? current.readiness.prepConfirmed,
      },
    });
    audit(actorFrom(request), "preop.update", { type: "ProcedureCase", id: caseId }, `Pre-op checklist updated (${Object.keys(payload).join(", ")})`);
    refreshReadiness(caseId);
    return detailResponse(caseId);
  }),

  http.post(apiUrl(P.caseVitals), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    if (!getCaseOrNull(caseId)) return notFound("Case");
    const payload = await body<SaveVitalsPayload>(request);
    const state = db();
    state.vitals.set(caseId, [
      ...(state.vitals.get(caseId) ?? []),
      { ...payload, id: newId("vit"), caseId, recordedAt: payload.recordedAt ?? new Date().toISOString(), recordedBy: actorFrom(request).ref },
    ]);
    return detailResponse(caseId);
  }),

  http.post(apiUrl(P.caseConsentSign), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const state = db();
    const consents = state.consents.get(caseId);
    const payload = await body<SignConsentPayload>(request);
    if (!consents?.some((consent) => consent.id === payload.consentId)) return notFound("Consent");
    if (!payload.signerName) return apiError(400, "VALIDATION_FAILED", "Signer name is required.");
    const actor = actorFrom(request);
    state.consents.set(
      caseId,
      consents.map((consent) =>
        consent.id === payload.consentId
          ? { ...consent, status: "signed", signerName: payload.signerName, witness: actor.ref, signedAt: new Date().toISOString(), ...(payload.signatureDataUrl ? { signatureDataUrl: payload.signatureDataUrl } : {}) }
          : consent,
      ),
    );
    audit(actor, "consent.sign", { type: "Consent", id: payload.consentId }, "Consent signed and witnessed");
    refreshReadiness(caseId);
    return detailResponse(caseId);
  }),

  http.post(apiUrl(P.caseTimeOut), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const blocked = requirePhase(caseId, ["READY_FOR_PROCEDURE"], "attest the time-out");
    if (blocked) return blocked;
    const payload = await body<AttestTimeOutPayload>(request);
    if (!Object.values(payload.checklist).every(Boolean)) {
      return apiError(422, "GATE_FAILED", "Complete every time-out item before attesting.", { TIMEOUT_CHECKLIST: "Complete every time-out item." });
    }
    const state = db();
    const actor = actorFrom(request);
    const current = caseDetail(caseId)?.timeOut;
    if (!current) return notFound("Case");
    const attestations = [
      ...current.attestations.filter((item) => item.role !== payload.role),
      { role: payload.role, by: actor.ref, at: new Date().toISOString() },
    ];
    const complete = TIME_OUT_ROLES.every((role) => attestations.some((item) => item.role === role));
    state.timeOut.set(caseId, { caseId, checklist: payload.checklist, attestations, ...(complete ? { completedAt: new Date().toISOString() } : {}) });
    audit(actor, "timeout.attest", { type: "ProcedureCase", id: caseId }, `Time-out attested (${payload.role})`);
    refreshReadiness(caseId);
    return detailResponse(caseId);
  }),

  http.post(apiUrl(P.caseEvents), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const blocked = requirePhase(caseId, ["READY_FOR_PROCEDURE", "IN_PROCEDURE"], "record procedure events");
    if (blocked) return blocked;
    const payload = await body<AddProcedureEventPayload>(request);
    const state = db();
    const events = state.events.get(caseId) ?? [];
    if (SINGLE_EVENTS.includes(payload.type) && events.some((event) => event.type === payload.type)) {
      return apiError(409, "EVENT_DUPLICATE", `${payload.type.toLowerCase().replaceAll("_", " ")} is already recorded.`);
    }
    const actor = actorFrom(request);
    const at = payload.at ?? new Date().toISOString();
    state.events.set(caseId, [...events, { id: newId("evt"), caseId, type: payload.type, at, by: actor.ref, ...(payload.note ? { note: payload.note } : {}) }]);
    const anesthesia = state.anesthesia.get(caseId);
    if (anesthesia && payload.type === "SEDATION_START") state.anesthesia.set(caseId, { ...anesthesia, sedationStart: at });
    if (anesthesia && payload.type === "SEDATION_END") state.anesthesia.set(caseId, { ...anesthesia, sedationEnd: at });
    audit(actor, "procedure.event", { type: "ProcedureCase", id: caseId }, `Event ${payload.type}`);
    return detailResponse(caseId);
  }),

  http.put(apiUrl(P.caseBbps), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    if (!getCaseOrNull(caseId)) return notFound("Case");
    updateCase(caseId, { bbps: await body<BbpsScore>(request) });
    return detailResponse(caseId);
  }),

  http.post(apiUrl(P.caseNarration), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const blocked = requirePhase(caseId, ["IN_PROCEDURE"], "add narration");
    if (blocked) return blocked;
    const payload = await body<{ speaker: string; text: string }>(request);
    const state = db();
    state.narration.set(caseId, [...(state.narration.get(caseId) ?? []), { id: newId("nar"), caseId, at: new Date().toISOString(), speaker: payload.speaker, text: payload.text }]);
    return detailResponse(caseId);
  }),

  http.post(apiUrl(P.caseSpecimens), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const blocked = requirePhase(caseId, ["IN_PROCEDURE"], "log specimens");
    if (blocked) return blocked;
    const payload = await body<AddSpecimenPayload>(request);
    const state = db();
    const specimens = state.specimens.get(caseId) ?? [];
    const actor = actorFrom(request);
    const specimen = {
      ...payload,
      id: newId("spc"),
      caseId,
      jar: JARS[specimens.length] ?? String(specimens.length + 1),
      collectedAt: new Date().toISOString(),
      pathologyStatus: "pending" as const,
    };
    state.specimens.set(caseId, [...specimens, specimen]);
    addWorkItem({
      type: "pending_pathology",
      title: `Pathology pending — ${getCaseOrNull(caseId)?.caseNumber ?? caseId}`,
      detail: "Specimens sent to lab; reconcile when results arrive.",
      ownerRole: "ADMIN",
      priority: "normal",
      dueAt: new Date(Date.now() + 5 * 24 * 3_600_000).toISOString(),
      caseId,
    });
    audit(actor, "specimen.add", { type: "Specimen", id: specimen.id }, `Specimen jar ${specimen.jar} logged`);
    return detailResponse(caseId);
  }),

  http.post(apiUrl(P.caseImages), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const blocked = requirePhase(caseId, ["IN_PROCEDURE"], "capture images");
    if (blocked) return blocked;
    const payload = await body<AddImagePayload>(request);
    const state = db();
    state.images.set(caseId, [...(state.images.get(caseId) ?? []), { ...payload, id: newId("img"), caseId, at: new Date().toISOString() }]);
    return detailResponse(caseId);
  }),

  http.post(apiUrl(P.caseAnesthesia), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const record = caseDetail(caseId)?.anesthesia;
    if (!record) return notFound("Case");
    const payload = await body<AnesthesiaEntryPayload>(request);
    const actor = actorFrom(request);
    db().anesthesia.set(caseId, applyAnesthesiaEntry(record, payload, actor));
    audit(actor, "anesthesia.entry", { type: "AnesthesiaRecord", id: caseId }, `Anesthesia ${payload.kind} recorded`);
    return detailResponse(caseId);
  }),
];
