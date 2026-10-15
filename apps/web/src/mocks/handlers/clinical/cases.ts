import {
  computeOverallReadiness,
  evaluateAnticoagulationHold,
  evaluateHpValidity,
  findScheduleConflicts,
  TIME_OUT_ROLES,
  toIsoDate,
  transitionGate,
} from "@asc/clinical-rules";
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
  Consent,
  HpAssessment,
  HpDetailResponse,
  ProcedureCase,
  ProcedureCode,
  ProcedureEventType,
  ReadinessCheck,
  ReadinessCheckStatus,
  SaveHpPayload,
  SavePreOpPayload,
  SaveVitalsPayload,
  ScheduleDay,
  SignConsentPayload,
  SubmitAnticoagulationResult,
  SubmitHpOverrideResult,
  SubmitHpUpdateResult,
  TransitionCasePayload,
  VitalsEntry,
} from "@asc/types";
import { formatZodError } from "@asc/validation/errors";
import { signConsentSchema, type SignConsentInput } from "@asc/validation/consent";
import { preopAssessmentSchema, type PreopAssessmentInput } from "@asc/validation/preop";
import { hpOverrideSchema, hpUpdateNoteSchema, type HpOverrideInput, type HpUpdateNoteInput } from "@asc/validation/hp";
import { anticoagulationAssessmentSchema, type AnticoagulationAssessmentInput } from "@asc/validation/anticoagulation";
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
  resolveTarget,
  roomsNow,
  setPhase,
  updateCase,
} from "../../db/store";
import { newId, patientRef, staffRef } from "../../db/util";
import { apiUrl } from "../api-url";
import { apiError, body, caseNotFound, detailResponse, gateFailed, latency, notFound, param } from "./respond";

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

function isProcedureCodeMismatch(caseProcedure: ProcedureCode, inputCode: string): boolean {
  const normalized = inputCode.trim().toUpperCase();
  if (normalized === caseProcedure) return false;

  // Colonoscopy CPTs: 45378, 45380, 45385, etc.
  if (caseProcedure === "COLONOSCOPY") {
    if (normalized.startsWith("4537") || normalized.startsWith("4538") || normalized.startsWith("4539")) {
      return false;
    }
    return true;
  }
  // EGD CPTs: 43235, 43239, 43248, etc.
  if (caseProcedure === "EGD") {
    if (normalized.startsWith("432")) {
      return false;
    }
    return true;
  }
  // FLEX_SIG: 45330, etc.
  if (caseProcedure === "FLEX_SIG") {
    if (normalized.startsWith("4533")) {
      return false;
    }
    return true;
  }
  if (caseProcedure === "EGD_COLONOSCOPY") {
    return false;
  }
  return false;
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
    const raw = (await request.json().catch(() => ({}))) as Record<string, string | number | undefined>;
    const patientId = String(raw.patientId ?? "");
    const patient = state.patients.get(patientId);
    if (!patient) return notFound("Patient");

    const surgeonId = String(raw.primaryPhysicianId ?? raw.surgeonId ?? "");
    const anesthesiaId = String(raw.anesthesiologistId ?? raw.anesthesiaId ?? "");
    const nurseId = String(raw.nurseId ?? "");

    const staff = (id: string) => STAFF_LIST.find((member) => member.id === id);
    const staffByRole = Object.groupBy(STAFF_LIST, (m) => m.role);
    const surgeon = staff(surgeonId) ?? staffByRole.SURGEON?.[0];
    if (!surgeon) return apiError(400, "VALIDATION_FAILED", "Choose a valid surgeon.");

    const anesthesia = anesthesiaId ? staff(anesthesiaId) : undefined;
    const nurse = nurseId ? staff(nurseId) : undefined;

    const scheduledStart = String(raw.scheduledAt ?? raw.scheduledStart ?? new Date().toISOString());
    const durationMin = Number(raw.durationMinutes ?? raw.durationMin ?? 45);
    const roomId = String(raw.roomId ?? "room-1");
    const procedureCode = (raw.procedure as ProcedureCase["procedure"]) ?? "COLONOSCOPY";
    const intent = (raw.procedureIntent ?? raw.intent ?? "screening") as ProcedureCase["intent"];
    const indication = String(raw.notes ?? raw.indication ?? "Screening colonoscopy");

    const conflictPayload: BookCasePayload = {
      patientId: patient.id,
      procedure: procedureCode,
      intent,
      indication,
      roomId,
      scheduledStart,
      durationMin,
      surgeonId: surgeon.id,
      anesthesiaId: anesthesia?.id,
      nurseId: nurse?.id,
    };

    const conflicts = findScheduleConflicts([...state.cases.values()], conflictPayload);
    if (!conflicts.ok) {
      return apiError(
        409,
        "conflict",
        conflicts.reasons[0]?.message ?? "Schedule conflict",
        Object.fromEntries(conflicts.conflicts.map((c) => [c.kind, c.message])),
        conflicts.reasons.map((r) => ({ code: r.code, message: r.message })),
      );
    }

    const actor = actorFrom(request);
    const id = newId("case");
    const eligibilityActive = patient.coverage?.eligibility?.status === "active";
    const procedureCase: ProcedureCase = {
      id,
      caseNumber: nextCaseNumber(),
      patientId: patient.id,
      patient: patientRef(patient),
      procedure: procedureCode,
      procedureLabel: PROCEDURE_LABEL[procedureCode] ?? "Colonoscopy",
      intent,
      indication,
      roomId,
      scheduledStart,
      durationMin,
      team: {
        surgeon: staffRef(surgeon),
        anesthesia: staffRef(anesthesia ?? staffByRole.ANESTHESIOLOGIST?.[0] ?? surgeon),
        nurse: staffRef(nurse ?? staffByRole.NURSE?.[0] ?? surgeon),
      },
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
    const referralId = typeof raw.referralId === "string" ? raw.referralId : undefined;
    if (referralId) {
      const referral = state.referrals.get(referralId);
      if (referral) state.referrals.set(referral.id, { ...referral, caseId: id, patientId: patient.id, status: "converted" });
      completeWorkItems((item) => item.referralId === referralId);
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
    audit(actor, "case.book", { type: "ProcedureCase", id }, `Booked ${procedureCase.caseNumber} (${procedureCase.procedureLabel}, ${intent})`);
    return HttpResponse.json(
      {
        caseId: id,
        appointmentId: newId("apt"),
        encounterId: id,
        scheduledAt: scheduledStart,
        ...procedureCase,
      },
      { status: 201 },
    );
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
    if (!detail) return caseNotFound(caseId);
    const payload = await body<TransitionCasePayload>(request);
    if (!payload?.to || typeof payload.to !== "string" || payload.to.trim() === "") {
      return apiError(400, "invalid_payload", "Invalid case transition payload");
    }
    const { to, reason } = payload;
    const actor = actorFrom(request);
    const { canonicalTarget, stage, phase } = resolveTarget(to);
    const result = transitionGate(detail, canonicalTarget);
    if (!result.ok) {
      audit(actor, "case.transition", { type: "ProcedureCase", id: caseId }, `${detail.case.caseNumber} → ${to} blocked (${result.reasons[0]?.code ?? "rule"})`, "denied");
      return gateFailed(result);
    }
    setPhase(caseId, canonicalTarget, actor, reason);
    if (phase === "READY_FOR_PROCEDURE" || stage === "in_room") {
      completeWorkItems((item) => item.caseId === caseId && item.type === "med_hold_review");
    }
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

  http.post(apiUrl(P.casePreopAssessment), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const current = getCaseOrNull(caseId);
    if (!current) return caseNotFound(caseId);

    const rawPayload = await body<PreopAssessmentInput>(request);
    const parsed = preopAssessmentSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return apiError(400, "invalid_payload", "Invalid pre-op assessment payload", formatZodError(parsed.error).details);
    }
    const payload = parsed.data;
    const state = db();
    const actor = actorFrom(request);
    const nowIso = new Date().toISOString();

    const npoPassed =
      payload.npo.solidFoodHoursAgo >= 6 &&
      payload.npo.clearLiquidsHoursAgo >= 2 &&
      payload.npo.confirmed;

    const prepCheckStatus: ReadinessCheckStatus = npoPassed ? "satisfied" : "failed";
    const prepDetails = npoPassed
      ? `NPO confirmed: solids ${payload.npo.solidFoodHoursAgo}h ago, clear liquids ${payload.npo.clearLiquidsHoursAgo}h ago`
      : `NPO violation: solids ${payload.npo.solidFoodHoursAgo}h (< 6h) or clear liquids ${payload.npo.clearLiquidsHoursAgo}h (< 2h)`;

    const escortCheckStatus: ReadinessCheckStatus = payload.escort.confirmedPresent ? "satisfied" : "pending";
    const escortDetails = payload.escort.confirmedPresent
      ? `Escort confirmed: ${payload.escort.name} (${payload.escort.phone})`
      : `Escort unconfirmed: ${payload.escort.name} (${payload.escort.phone})`;

    const vitalsEntry: VitalsEntry = {
      id: newId("vit"),
      caseId,
      context: "pre_op",
      recordedAt: nowIso,
      sbp: payload.vitals.sbp,
      dbp: payload.vitals.dbp,
      hr: payload.vitals.hr,
      rr: payload.vitals.rr,
      spo2: payload.vitals.spo2,
      tempC: payload.vitals.tempC,
      recordedBy: actor.ref,
    };
    state.vitals.set(caseId, [...(state.vitals.get(caseId) ?? []), vitalsEntry]);

    const patient = state.patients.get(current.patientId);
    if (patient) {
      state.patients.set(patient.id, {
        ...patient,
        escort: {
          name: payload.escort.name,
          phone: payload.escort.phone,
          relationship: payload.escort.relationship,
          confirmed: payload.escort.confirmedPresent,
          present: payload.escort.confirmedPresent,
        },
      });
    }

    const existingChecks: readonly ReadinessCheck[] = current.readinessChecks ?? [
      { name: "identity", label: "Patient identity", status: "satisfied" },
      { name: "hp", label: "History & physical", status: "satisfied" },
      { name: "consent", label: "Informed consent", status: "satisfied" },
    ];

    const updatedPrepCheck: ReadinessCheck = {
      name: "prep",
      label: "Bowel preparation",
      status: prepCheckStatus,
      details: prepDetails,
    };

    const updatedEscortCheck: ReadinessCheck = {
      name: "escort",
      label: "Responsible escort",
      status: escortCheckStatus,
      details: escortDetails,
    };

    const nextChecks: readonly ReadinessCheck[] = [
      ...existingChecks.filter((c) => c.name !== "prep" && c.name !== "escort"),
      updatedPrepCheck,
      updatedEscortCheck,
    ];

    const nextOverall = computeOverallReadiness(nextChecks);

    updateCase(caseId, {
      readinessChecks: nextChecks,
      overallReadiness: nextOverall,
      readiness: {
        ...current.readiness,
        npoConfirmed: npoPassed,
        prepConfirmed: npoPassed,
        escortConfirmed: payload.escort.confirmedPresent,
        ivPlaced: true,
      },
    });

    audit(actor, "preop.assessment", { type: "ProcedureCase", id: caseId }, `Pre-op assessment recorded (NPO: ${prepCheckStatus}, Escort: ${escortCheckStatus}, IV placed)`);

    return HttpResponse.json({
      status: 200,
      ok: true,
      vitals: vitalsEntry,
      readiness: getCaseOrNull(caseId)?.readiness,
      readinessChecks: nextChecks,
      overallReadiness: nextOverall,
    });
  }),

  http.post(apiUrl(P.caseConsent), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const current = getCaseOrNull(caseId);
    if (!current) return caseNotFound(caseId);

    const rawPayload = await body<SignConsentInput>(request);
    const parsed = signConsentSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return apiError(400, "invalid_payload", "Invalid consent payload", formatZodError(parsed.error).details);
    }
    const payload = parsed.data;
    const state = db();
    const actor = actorFrom(request);

    const isMismatch = isProcedureCodeMismatch(current.procedure, payload.procedureCode);
    const consentStatus: ReadinessCheckStatus = isMismatch ? "failed" : "satisfied";
    const consentDetails = isMismatch
      ? `Procedure mismatch: signed for ${payload.procedureName} (${payload.procedureCode}), scheduled for ${current.procedureLabel}`
      : `Signed by ${payload.signerName} (${payload.signerRelationship})`;

    const mappedConsent: Consent = {
      id: newId("cns"),
      caseId,
      kind: "procedure",
      title: payload.procedureName,
      summary: `Informed consent for ${payload.procedureName} performed by ${payload.performingPhysicianName}`,
      status: "signed",
      signerName: payload.signerName,
      signedAt: new Date().toISOString(),
      signatureDataUrl: payload.signatureDataUrl,
    };

    const existingConsents = state.consents.get(caseId) ?? [];
    state.consents.set(caseId, [
      mappedConsent,
      ...existingConsents.filter((c) => c.kind !== "procedure"),
    ]);

    const existingChecks: readonly ReadinessCheck[] = current.readinessChecks ?? [
      { name: "identity", label: "Patient identity", status: "satisfied" },
      { name: "hp", label: "History & physical", status: "satisfied" },
    ];

    const updatedConsentCheck: ReadinessCheck = {
      name: "consent",
      label: "Informed consent",
      status: consentStatus,
      details: consentDetails,
    };

    const nextChecks: readonly ReadinessCheck[] = [
      ...existingChecks.filter((c) => c.name !== "consent"),
      updatedConsentCheck,
    ];

    const nextOverall = computeOverallReadiness(nextChecks);

    updateCase(caseId, {
      readinessChecks: nextChecks,
      overallReadiness: nextOverall,
      readiness: {
        ...current.readiness,
        consentsSigned: consentStatus === "satisfied",
      },
    });

    audit(actor, "consent.sign", { type: "Consent", id: mappedConsent.id }, `Informed consent signed by ${payload.signerName} (${consentStatus})`);

    return HttpResponse.json({
      status: 200,
      ok: true,
      consent: mappedConsent,
      readiness: getCaseOrNull(caseId)?.readiness,
      readinessChecks: nextChecks,
      overallReadiness: nextOverall,
    });
  }),

  http.get(apiUrl(P.caseConsent), async ({ params }) => {
    await latency();
    const caseId = param(params.caseId);
    const current = getCaseOrNull(caseId);
    if (!current) return caseNotFound(caseId);
    const consents = db().consents.get(caseId) ?? [];
    const procedureConsent = consents.find((c) => c.kind === "procedure" && c.status === "signed");
    return HttpResponse.json(procedureConsent ?? null);
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
    // A new case has no stored anesthesia record yet — start from the default so sedation times stay in sync.
    const anesthesia = state.anesthesia.get(caseId) ?? caseDetail(caseId)?.anesthesia;
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

  http.post(apiUrl(P.caseHpUpdate), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const current = getCaseOrNull(caseId);
    if (!current) return caseNotFound(caseId);

    const rawPayload = await body<HpUpdateNoteInput>(request);
    const parsed = hpUpdateNoteSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return apiError(400, "invalid_payload", "Invalid H&P update note payload", formatZodError(parsed.error).details);
    }
    const payload = parsed.data;
    const actor = actorFrom(request);
    const practitionerName = payload.practitionerName || actor.name || "Attending Physician";

    const existingChecks: readonly ReadinessCheck[] = current.readinessChecks ?? [
      { name: "identity", label: "Patient identity", status: "satisfied" },
      { name: "hp", label: "History & physical", status: "pending" },
    ];

    const updatedHpCheck: ReadinessCheck = {
      name: "hp",
      label: "History & physical",
      status: "satisfied",
      details: `Day-of interval update signed by ${practitionerName}: No interval change in cardiovascular, pulmonary, or airway status`,
    };

    const nextChecks: readonly ReadinessCheck[] = [
      ...existingChecks.filter((c) => c.name !== "hp"),
      updatedHpCheck,
    ];

    const nextOverall = computeOverallReadiness(nextChecks);

    updateCase(caseId, {
      readinessChecks: nextChecks,
      overallReadiness: nextOverall,
      readiness: {
        ...current.readiness,
        hpCurrent: true,
      },
    });

    audit(actor, "hp.update", { type: "ProcedureCase", id: caseId }, `Day-of H&P interval update note signed by ${practitionerName}`);

    const updatedCase = getCaseOrNull(caseId);

    const result: SubmitHpUpdateResult = {
      ok: true,
      documentId: `doc-update-${newId("doc")}`,
      readiness: updatedCase?.readiness,
      readinessChecks: nextChecks,
      overallReadiness: nextOverall,
      case: updatedCase ?? undefined,
    };
    return HttpResponse.json(result);
  }),

  http.post(apiUrl(P.caseHpOverride), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const current = getCaseOrNull(caseId);
    if (!current) return caseNotFound(caseId);

    const rawPayload = await body<HpOverrideInput>(request);
    const parsed = hpOverrideSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return apiError(400, "invalid_payload", "Invalid H&P override payload", formatZodError(parsed.error).details);
    }
    const payload = parsed.data;

    // Role check: only attending-physician or medical-director can override H&P (AC-F-02-2)
    if (payload.role !== "attending-physician" && payload.role !== "medical-director") {
      return apiError(403, "forbidden", "H&P override requires attending physician or medical director role");
    }

    const actor = actorFrom(request);
    const practitionerName = payload.practitionerName || actor.name || "Attending Physician";

    const existingChecks: readonly ReadinessCheck[] = current.readinessChecks ?? [
      { name: "identity", label: "Patient identity", status: "satisfied" },
      { name: "hp", label: "History & physical", status: "pending" },
    ];

    const updatedHpCheck: ReadinessCheck = {
      name: "hp",
      label: "History & physical",
      status: "waived",
      waivedRole: payload.role,
      waivedBy: practitionerName,
      waivedAt: payload.overriddenAt || new Date().toISOString(),
      waiverReason: payload.overrideReason,
      details: `Clinically waived by ${practitionerName} (${payload.role}): ${payload.overrideReason}`,
    };

    const nextChecks: readonly ReadinessCheck[] = [
      ...existingChecks.filter((c) => c.name !== "hp"),
      updatedHpCheck,
    ];

    const nextOverall = computeOverallReadiness(nextChecks);

    updateCase(caseId, {
      readinessChecks: nextChecks,
      overallReadiness: nextOverall,
      readiness: {
        ...current.readiness,
        hpCurrent: true,
      },
    });

    audit(actor, "hp.override", { type: "ProcedureCase", id: caseId }, `H&P waived by ${payload.role} (${practitionerName}): ${payload.overrideReason}`);

    const updatedCase = getCaseOrNull(caseId);

    const result: SubmitHpOverrideResult = {
      ok: true,
      readiness: updatedCase?.readiness,
      readinessChecks: nextChecks,
      overallReadiness: nextOverall,
      case: updatedCase ?? undefined,
    };
    return HttpResponse.json(result);
  }),

  http.post(apiUrl(P.caseAnticoagulation), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const current = getCaseOrNull(caseId);
    if (!current) return caseNotFound(caseId);

    const rawPayload = await body<AnticoagulationAssessmentInput>(request);
    const parsed = anticoagulationAssessmentSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return apiError(400, "invalid_payload", "Invalid anticoagulation assessment payload", formatZodError(parsed.error).details);
    }
    const payload = parsed.data;
    const actor = actorFrom(request);

    const patient = db().patients.get(current.patientId);
    const patientMeds = patient?.medications ?? [];

    const evaluation = evaluateAnticoagulationHold({
      medications: patientMeds,
      procedureBleedingRisk: payload.procedureBleedingRisk,
      assessments: payload.medications,
    });

    const existingChecks: readonly ReadinessCheck[] = current.readinessChecks ?? [
      { name: "identity", label: "Patient identity", status: "satisfied" },
      { name: "consent", label: "Informed consent", status: "satisfied" },
      { name: "hp", label: "History & physical", status: "satisfied" },
    ];

    const updatedAnticoagCheck: ReadinessCheck = {
      name: "anticoagulation",
      label: "Anticoagulation & antiplatelet clearance",
      status: evaluation.status,
      details: evaluation.message,
    };

    const nextChecks: readonly ReadinessCheck[] = [
      ...existingChecks.filter((c) => c.name !== "anticoagulation"),
      updatedAnticoagCheck,
    ];

    const nextOverall = computeOverallReadiness(nextChecks);

    updateCase(caseId, {
      readinessChecks: nextChecks,
      overallReadiness: nextOverall,
      readiness: {
        ...current.readiness,
        holdsConfirmed: evaluation.status === "satisfied",
      },
    });

    audit(actor, "anticoagulation.assess", { type: "ProcedureCase", id: caseId }, `Anticoagulation evaluated: ${evaluation.status} (${evaluation.message})`);

    const updatedCase = getCaseOrNull(caseId);

    const result: SubmitAnticoagulationResult = {
      ok: true,
      evaluation,
      observationId: `obs-anticoag-${newId("obs")}`,
      readiness: updatedCase?.readiness,
      readinessChecks: nextChecks,
      overallReadiness: nextOverall,
      case: updatedCase ?? undefined,
    };
    return HttpResponse.json(result);
  }),

  http.get(apiUrl(P.caseHp), async ({ params }) => {
    await latency();
    const caseId = param(params.caseId);
    const current = getCaseOrNull(caseId);
    if (!current) return caseNotFound(caseId);

    const hpRecord = db().hp.get(caseId);
    const hpCheck = current.readinessChecks?.find((c) => c.name === "hp");
    const documentedDate = hpRecord?.performedAt?.split("T")[0] ?? hpRecord?.signedAt?.split("T")[0] ?? null;
    const procedureDate = current.scheduledStart.split("T")[0] ?? toIsoDate(new Date());

    const validity = evaluateHpValidity({
      documentedDate,
      procedureDate,
      updateNoteSignedDate: hpCheck?.status === "satisfied" ? procedureDate : null,
    });

    const response: HpDetailResponse = {
      caseId,
      status: hpCheck?.status ?? validity.status,
      validity,
      documentedDate,
      updateNote: hpCheck?.status === "satisfied" && validity.requiresUpdateNote ? {
        id: `doc-hp-update-${caseId}`,
        signedAt: new Date().toISOString(),
        practitionerName: "Attending Physician",
        attestation: "No interval change in cardiovascular, pulmonary, or airway status",
      } : null,
      override: hpCheck?.status === "waived" ? {
        waivedBy: hpCheck.waivedBy,
        waivedRole: hpCheck.waivedRole,
        waivedAt: hpCheck.waivedAt,
        waiverReason: hpCheck.waiverReason,
      } : null,
    };

    return HttpResponse.json(response);
  }),
];
