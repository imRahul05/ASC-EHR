import {
  calculateGoodFaithEstimate,
  computeOverallReadiness,
  evaluateAnticoagulationHold,
  evaluateEligibilityStatus,
  evaluateFinancialClearance,
  evaluateGate2WithOverride,
  evaluateHpValidity,
  evaluatePriorAuthValidity,
  findScheduleConflicts,
  SCOPE_HANG_TIME_HOURS,
  TIME_OUT_ROLES,
  toIsoDate,
  transitionGate,
} from "@asc/clinical-rules";
import { evaluatePreAnesthesiaReadiness } from "@asc/clinical-rules/aims/pre-anesthesia";
import { API_ROUTE_PATTERNS as P } from "@asc/config/api";
import { API_ERROR_CODES } from "@asc/types/errors";
import type {
  AddImagePayload,
  AddProcedureEventPayload,
  AddSpecimenPayload,
  AimsBatchEntry,
  AnesthesiaEntryPayload,
  AnesthesiaRecord,
  AttestTimeOutPayload,
  BbpsScore,
  BookCasePayload,
  CheckInPayload,
  Consent,
  CopayCollectionResult,
  EligibilityCheckResult,
  FinancialSummary,
  Gate2OverrideRecord,
  HpAssessment,
  HpDetailResponse,
  PreAnesthesiaAssessment,
  PriorAuthResult,
  ProcedureCase,
  ProcedureCode,
  ProcedureEventType,
  ReadinessCheck,
  ReadinessCheckStatus,
  SaveHpPayload,
  SavePreOpPayload,
  SaveVitalsPayload,
  ScheduleDay,
  ScopeAssignmentRecord,
  SignConsentPayload,
  SubmitAnticoagulationResult,
  SubmitHpOverrideResult,
  SubmitHpUpdateResult,
  TimeOutRole,
  TransitionCasePayload,
  VitalsEntry,
} from "@asc/types";
import { formatZodError } from "@asc/validation/errors";
import { signConsentSchema, type SignConsentInput } from "@asc/validation/consent";
import { preopAssessmentSchema, type PreopAssessmentInput } from "@asc/validation/preop";
import { hpOverrideSchema, hpUpdateNoteSchema, type HpOverrideInput, type HpUpdateNoteInput } from "@asc/validation/hp";
import { anticoagulationAssessmentSchema, type AnticoagulationAssessmentInput } from "@asc/validation/anticoagulation";
import type { PreAnesthesiaAssessmentInput } from "@asc/validation/aims.schema";
import {
  assignScopeInputSchema,
  gate2OverrideInputSchema,
  signTimeOutInputSchema,
  type TimeOutParticipantRole,
} from "@asc/validation/procedure-capture";
import {
  copayCollectionSchema,
  eligibilityCheckRequestSchema,
  priorAuthCheckSchema,
  type EligibilityResponse,
} from "@asc/validation/financial";
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
  getCaseFinancial,
  getCaseOrNull,
  getScopeAssignment,
  refreshReadiness,
  resolveTarget,
  roomsNow,
  setGate2Override,
  setPhase,
  setScopeAssignment,
  updateCase,
  updateCaseFinancial,
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

const PARTICIPANT_TIMEOUT_ROLE_MAP: Readonly<Record<TimeOutParticipantRole, TimeOutRole>> = {
  endoscopist: "SURGEON",
  circulating_rn: "NURSE",
  tech: "TECH",
  anesthesia: "ANESTHESIOLOGIST",
};

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

function applyAnesthesiaEntry(
  record: AnesthesiaRecord,
  payload: AnesthesiaEntryPayload,
  actor: ReturnType<typeof actorFrom>,
  clientId?: string,
): AnesthesiaRecord {
  const now = new Date().toISOString();
  switch (payload.kind) {
    case "dose":
      return {
        ...record,
        doses: [
          ...record.doses,
          {
            id: clientId ?? newId("dose"),
            drug: payload.drug,
            amount: payload.amount,
            unit: payload.unit,
            route: "IV",
            at: payload.at ?? now,
            by: actor.ref,
          },
        ],
      };
    case "vitals":
      return {
        ...record,
        vitals: [
          ...record.vitals,
          {
            ...payload.vitals,
            id: clientId ?? newId("vit"),
            caseId: record.caseId,
            context: "intra",
            recordedAt: payload.vitals.recordedAt ?? now,
            recordedBy: actor.ref,
          },
        ],
      };
    case "airway_event":
      return {
        ...record,
        airwayEvents: [
          ...record.airwayEvents,
          {
            id: clientId ?? newId("air"),
            type: payload.type,
            at: now,
            ...(payload.note ? { note: payload.note } : {}),
          },
        ],
      };
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
        API_ERROR_CODES.CONFLICT,
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
      return apiError(400, API_ERROR_CODES.INVALID_PAYLOAD, "Invalid case transition payload");
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
    if (sign && next.asa == null) return apiError(409, API_ERROR_CODES.GATE_FAILED, "Record the ASA class before signing.", { ASA_SET: "Record the ASA class before signing." });
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
      return apiError(400, API_ERROR_CODES.INVALID_PAYLOAD, "Invalid pre-op assessment payload", formatZodError(parsed.error).details);
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
      return apiError(400, API_ERROR_CODES.INVALID_PAYLOAD, "Invalid consent payload", formatZodError(parsed.error).details);
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
    const raw = await request.json();
    const parsed = signTimeOutInputSchema.safeParse(raw);
    const state = db();
    const actor = actorFrom(request);
    const current = caseDetail(caseId)?.timeOut;
    if (!current) return notFound("Case");

    if (parsed.success) {
      const { checklist, role, participants, completedAt } = parsed.data;
      if (
        !checklist.patientIdentity ||
        !checklist.procedureConfirmed ||
        !checklist.consentVerified ||
        !checklist.allergiesReviewed ||
        !checklist.equipmentReady ||
        !checklist.anticoagulationReviewed
      ) {
        return apiError(409, API_ERROR_CODES.GATE_FAILED, "Complete every required time-out item before attesting.", {
          TIMEOUT_CHECKLIST: "Complete every required time-out item.",
        });
      }
      let attestations = [...current.attestations];
      if (role) {
        attestations = [
          ...attestations.filter((item) => item.role !== role),
          { role, by: actor.ref, at: new Date().toISOString() },
        ];
      }
      if (participants && participants.length > 0) {
        for (const p of participants) {
          const participantRole: TimeOutRole = PARTICIPANT_TIMEOUT_ROLE_MAP[p.role];
          attestations = [
            ...attestations.filter((item) => item.role !== participantRole),
            {
              role: participantRole,
              by: {
                id: p.userId,
                name: p.name,
                initials:
                  p.name
                    .split(" ")
                    .map((s) => s[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2) || "MD",
              },
              at: p.acknowledgedAt ?? new Date().toISOString(),
            },
          ];
        }
      }
      const complete = TIME_OUT_ROLES.every((r) => attestations.some((item) => item.role === r));
      const formattedParticipants = participants
        ? participants.map((p) => ({
            userId: p.userId,
            name: p.name,
            role: p.role,
            acknowledgedAt: p.acknowledgedAt ?? new Date().toISOString(),
          }))
        : current.participants;

      state.timeOut.set(caseId, {
        caseId,
        checklist,
        participants: formattedParticipants,
        attestations,
        ...(complete ? { completedAt: completedAt ?? new Date().toISOString() } : {}),
      });
      audit(actor, "timeout.attest", { type: "ProcedureCase", id: caseId }, `Time-out attested`);
      refreshReadiness(caseId);
      return detailResponse(caseId);
    }

    const payload = raw as AttestTimeOutPayload;
    if (!Object.values(payload.checklist).every(Boolean)) {
      return apiError(409, API_ERROR_CODES.GATE_FAILED, "Complete every time-out item before attesting.", {
        TIMEOUT_CHECKLIST: "Complete every time-out item.",
      });
    }
    const attestations = [
      ...current.attestations.filter((item) => item.role !== payload.role),
      { role: payload.role, by: actor.ref, at: new Date().toISOString() },
    ];
    const complete = TIME_OUT_ROLES.every((r) => attestations.some((item) => item.role === r));
    state.timeOut.set(caseId, {
      caseId,
      checklist: payload.checklist,
      attestations,
      ...(complete ? { completedAt: new Date().toISOString() } : {}),
    });
    audit(actor, "timeout.attest", { type: "ProcedureCase", id: caseId }, `Time-out attested (${payload.role})`);
    refreshReadiness(caseId);
    return detailResponse(caseId);
  }),

  http.post(apiUrl(P.caseEvents), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const blocked = requirePhase(caseId, ["READY_FOR_PROCEDURE", "IN_PROCEDURE"], "record procedure events");
    if (blocked) return blocked;
    const payload = await body<AddProcedureEventPayload & { recordedAt?: string }>(request);
    const state = db();
    const events = state.events.get(caseId) ?? [];
    if (SINGLE_EVENTS.includes(payload.type) && events.some((event) => event.type === payload.type)) {
      return apiError(409, "EVENT_DUPLICATE", `${payload.type.toLowerCase().replaceAll("_", " ")} is already recorded.`);
    }
    const actor = actorFrom(request);
    const at = payload.at ?? payload.recordedAt ?? new Date().toISOString();
    state.events.set(caseId, [
      ...events,
      { id: newId("evt"), caseId, type: payload.type, at, by: actor.ref, ...(payload.note ? { note: payload.note } : {}) },
    ]);
    const anesthesia = state.anesthesia.get(caseId) ?? caseDetail(caseId)?.anesthesia;
    if (anesthesia && payload.type === "SEDATION_START") state.anesthesia.set(caseId, { ...anesthesia, sedationStart: at });
    if (anesthesia && payload.type === "SEDATION_END") state.anesthesia.set(caseId, { ...anesthesia, sedationEnd: at });
    audit(actor, "procedure.event", { type: "ProcedureCase", id: caseId }, `Event ${payload.type}`);
    return detailResponse(caseId);
  }),

  http.post(apiUrl(P.caseScope), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const blocked = requirePhase(caseId, ["PRE_OP", "READY_FOR_PROCEDURE", "IN_PROCEDURE"], "assign endoscope");
    if (blocked) return blocked;

    const raw = await request.json();
    const parsed = assignScopeInputSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(400, "VALIDATION_FAILED", "Invalid scope assignment payload", formatZodError(parsed.error).details);
    }
    const input = parsed.data;
    const assignedAt = input.assignedAt ?? new Date().toISOString();
    const reprocessedAtMs = Date.parse(input.reprocessedAt);
    const assignedAtMs = Date.parse(assignedAt);
    const hangTimeHours = Math.max(0, (assignedAtMs - reprocessedAtMs) / 3_600_000);
    const withinHangTimeWindow =
      hangTimeHours <= SCOPE_HANG_TIME_HOURS && input.leakTestResult === "PASS" && input.cycleOutcome === "PASS";

    const actor = actorFrom(request);
    const scopeRecord: ScopeAssignmentRecord = {
      scopeSerial: input.scopeSerial,
      scopeModel: input.scopeModel,
      reprocessedAt: input.reprocessedAt,
      assignedAt,
      assignedBy: actor.ref,
      leakTestResult: input.leakTestResult,
      cycleOutcome: input.cycleOutcome,
      hangTimeHours: Math.round(hangTimeHours * 10) / 10,
      withinHangTimeWindow,
    };
    setScopeAssignment(caseId, scopeRecord);
    audit(
      actor,
      "scope.assign",
      { type: "ProcedureCase", id: caseId },
      `Assigned scope ${input.scopeSerial} (hang time: ${scopeRecord.hangTimeHours}h, valid: ${withinHangTimeWindow})`,
    );
    refreshReadiness(caseId);
    return detailResponse(caseId);
  }),

  http.post(apiUrl(P.caseGate2Override), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const blocked = requirePhase(caseId, ["PRE_OP", "READY_FOR_PROCEDURE"], "override Gate 2");
    if (blocked) return blocked;

    const currentScope = getScopeAssignment(caseId);
    if (currentScope && !currentScope.withinHangTimeWindow) {
      return apiError(
        409,
        "SCOPE_LOCK_VIOLATION",
        "Cannot override Gate 2 while an active endoscope hang-time violation exists. ST91:2021 mandates scope reprocessing.",
        { SCOPE_LOCK_VIOLATION: "Scope hang time exceeds 168 hours or failed decontamination." },
      );
    }

    const raw = await request.json();
    const parsed = gate2OverrideInputSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(400, "VALIDATION_FAILED", "Invalid Gate 2 override payload", formatZodError(parsed.error).details);
    }
    const input = parsed.data;
    const actor = actorFrom(request);
    const currentDetail = caseDetail(caseId);
    const gate2Eval = evaluateGate2WithOverride({
      checks: currentDetail?.case.readinessChecks ?? [],
    });

    const overrideRecord: Gate2OverrideRecord = {
      actorId: actor.id,
      actorName: input.actorName || actor.name,
      actorRole: input.actorRole ?? actor.role,
      reason: input.reason,
      overriddenBlockers: gate2Eval.blockerCodes ?? [],
      overriddenAt: input.overriddenAt ?? new Date().toISOString(),
    };
    setGate2Override(caseId, overrideRecord);
    audit(
      actor,
      "gate2.override",
      { type: "ProcedureCase", id: caseId },
      `Gate 2 clinical override by ${overrideRecord.actorName}: ${overrideRecord.reason}`,
    );
    refreshReadiness(caseId);
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

    if (payload.kind === "sedation" && payload.edge === "start") {
      const readiness = evaluatePreAnesthesiaReadiness(record.preAssessment ?? undefined);
      if (!readiness.ok) {
        return gateFailed(readiness);
      }
    }

    db().anesthesia.set(caseId, applyAnesthesiaEntry(record, payload, actor));
    audit(actor, "anesthesia.entry", { type: "AnesthesiaRecord", id: caseId }, `Anesthesia ${payload.kind} recorded`);
    return detailResponse(caseId);
  }),

  http.post(apiUrl(P.casePreAnesthesia), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const detail = caseDetail(caseId);
    if (!detail) return notFound("Case");

    const payload = await body<PreAnesthesiaAssessmentInput>(request);
    const actor = actorFrom(request);

    const assessment: PreAnesthesiaAssessment = {
      asaClass: payload.asaClass,
      mallampati: payload.mallampati,
      airwayNotes: payload.airwayNotes,
      lastOralIntakeIso: payload.lastOralIntakeIso,
      npoStatusSatisfied: payload.npoStatusSatisfied,
      assessedAt: payload.assessedAt ?? new Date().toISOString(),
      assessedBy: payload.assessedBy ?? actor.ref,
    };

    const currentRecord = detail.anesthesia;
    db().anesthesia.set(caseId, {
      ...currentRecord,
      preAssessment: assessment,
    });

    const currentCase = db().cases.get(caseId);
    if (currentCase) {
      const checks = (currentCase.readinessChecks ?? []).map((check) =>
        check.name === "anesthesia_clearance" ? { ...check, status: "satisfied" as const } : check,
      );
      db().cases.set(caseId, {
        ...currentCase,
        readinessChecks: checks,
      });
    }

    audit(actor, "anesthesia.pre-eval", { type: "AnesthesiaRecord", id: caseId }, "Pre-anesthesia evaluation recorded");
    return HttpResponse.json(assessment);
  }),

  http.post(apiUrl(P.caseAimsBatch), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const detail = caseDetail(caseId);
    if (!detail) return notFound("Case");

    const raw = await body<{ readonly entries: readonly AimsBatchEntry[] }>(request);
    const actor = actorFrom(request);
    let record = detail.anesthesia;

    let syncedCount = 0;
    let duplicateCount = 0;

    for (const entry of raw.entries ?? []) {
      const isDuplicate =
        record.doses.some((d) => d.id === entry.clientId) ||
        record.vitals.some((v) => v.id === entry.clientId);

      if (isDuplicate) {
        duplicateCount++;
      } else {
        record = applyAnesthesiaEntry(record, entry.payload, actor, entry.clientId);
        syncedCount++;
      }
    }

    db().anesthesia.set(caseId, record);
    audit(actor, "anesthesia.batch-sync", { type: "AnesthesiaRecord", id: caseId }, `AIMS batch synced: ${syncedCount} entries`);
    return HttpResponse.json({ syncedCount, duplicateCount });
  }),

  http.post(apiUrl(P.caseHpUpdate), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const current = getCaseOrNull(caseId);
    if (!current) return caseNotFound(caseId);

    const rawPayload = await body<HpUpdateNoteInput>(request);
    const parsed = hpUpdateNoteSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return apiError(400, API_ERROR_CODES.INVALID_PAYLOAD, "Invalid H&P update note payload", formatZodError(parsed.error).details);
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
      return apiError(400, API_ERROR_CODES.INVALID_PAYLOAD, "Invalid H&P override payload", formatZodError(parsed.error).details);
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
      return apiError(400, API_ERROR_CODES.INVALID_PAYLOAD, "Invalid anticoagulation assessment payload", formatZodError(parsed.error).details);
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

  // POST /cases/:caseId/eligibility/check — Real-time X12 270/271 eligibility verification (Phase P22a)
  // HIPAA ANSI ASC X12 270/271: Real-time electronic healthcare eligibility and benefit inquiry.
  http.post(apiUrl(P.caseEligibilityCheck), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const current = getCaseOrNull(caseId);
    if (!current) return caseNotFound(caseId);

    const raw = await body<Record<string, unknown>>(request);
    const parsed = eligibilityCheckRequestSchema.safeParse({ caseId, ...raw });
    if (!parsed.success) {
      return apiError(400, API_ERROR_CODES.INVALID_PAYLOAD, "Invalid eligibility check payload", formatZodError(parsed.error).details);
    }

    const patient = db().patients.get(current.patientId);
    const isInactive = patient?.lastName?.toLowerCase().includes("inactive") || patient?.coverage?.eligibility?.status === "inactive";
    const isIncomplete = parsed.data.serviceTypeCode === "30";

    const eligibilityStatus: "active" | "inactive" | "incomplete" = isInactive ? "inactive" : isIncomplete ? "incomplete" : "active";
    const procedureDate = current.scheduledStart.split("T")[0] ?? toIsoDate(new Date());

    const mockEligibility: EligibilityResponse = {
      status: eligibilityStatus,
      planName: patient?.coverage?.payer ?? "Aetna Choice POS II",
      planType: "PPO",
      effectiveDate: "2024-01-01",
      subscriberRelationship: "self",
      inNetwork: true,
      individualDeductibleCents: 150000,
      individualDeductibleRemainingCents: 50000,
      copayCents: 0,
      coinsurancePercent: 20,
      outOfPocketMaxCents: 500000,
      outOfPocketRemainingCents: 250000,
      checkedAt: new Date().toISOString(),
    };

    const evaluation = evaluateEligibilityStatus(mockEligibility, procedureDate);

    if (evaluation.requiresWorkItem) {
      addWorkItem({
        type: "eligibility_failed",
        title: `Verify Endoscopy Benefits: ${current.caseNumber}`,
        detail: evaluation.reason ?? "Payer 271 response degraded or incomplete for GI endoscopy.",
        ownerRole: "ADMIN",
        priority: "high",
        dueAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
        caseId,
        patientId: patient?.id,
      });
    }

    updateCaseFinancial(caseId, {
      eligibilityStatus,
    });

    const nextChecks = (current.readinessChecks ?? []).map((c) => {
      if (c.name === "coverage") {
        return {
          ...c,
          status: evaluation.status,
          label: "Active eligibility",
          details: evaluation.reason,
        };
      }
      if (c.name === "benefits") {
        return {
          ...c,
          status: eligibilityStatus === "active" ? ("satisfied" as const) : ("pending" as const),
          label: "Benefits capture",
          details: eligibilityStatus === "active" ? "Benefits recorded" : "Incomplete benefit response",
        };
      }
      return c;
    });

    const nextOverall = computeOverallReadiness(nextChecks);
    updateCase(caseId, {
      readinessChecks: nextChecks,
      overallReadiness: nextOverall,
      readiness: {
        ...current.readiness,
        eligibilityActive: eligibilityStatus === "active",
      },
    });

    const result: EligibilityCheckResult = {
      eligibility: mockEligibility,
      evaluation,
      requestId: `req-270-${newId("req")}`,
      responseId: `res-271-${newId("res")}`,
    };

    return HttpResponse.json(result);
  }),

  // GET /cases/:caseId/financial-summary — Full financial clearance summary and dual GFE (Phase P22a)
  // ACA 42 U.S.C. § 300gg-13 (Preventive mandate) & No Surprises Act 45 CFR § 149 (Dual GFE disclosure).
  http.get(apiUrl(P.caseFinancialSummary), async ({ params }) => {
    await latency();
    const caseId = param(params.caseId);
    const current = getCaseOrNull(caseId);
    if (!current) return caseNotFound(caseId);

    const fin = getCaseFinancial(caseId);
    const patient = db().patients.get(current.patientId);

    const deductibleRemainingCents = 50000;
    const coinsurancePercent = 20;
    const copayCents = 0;
    const outOfPocketRemainingCents = 250000;

    const gfeIntent: "screening" | "diagnostic" | "surveillance" =
      current.intent === "screening" ? "screening" : current.intent === "surveillance" ? "surveillance" : "diagnostic";

    const estimate = calculateGoodFaithEstimate({
      cptCode: current.procedure === "COLONOSCOPY" ? "45378" : "43235",
      intent: gfeIntent,
      allowableFeeCents: 150000,
      deductibleRemainingCents,
      coinsurancePercent,
      copayCents,
      preventiveMandateApplies: current.procedure === "COLONOSCOPY" && current.intent === "screening",
      outOfPocketRemainingCents,
    });

    const clearance = evaluateFinancialClearance({
      eligibilityStatus: fin.eligibilityStatus === "active" ? "satisfied" : fin.eligibilityStatus === "inactive" ? "failed" : "pending",
      priorAuthStatus: fin.priorAuth?.status === "approved" ? "satisfied" : fin.priorAuth?.status === "denied" ? "failed" : "not_required",
      estimatedPatientOwedCents: estimate.patientResponsibilityCents,
      collectedCents: fin.collectedCents,
      hasPaymentPlan: fin.paymentPlanActive,
    });

    const summary: FinancialSummary = {
      caseId,
      eligibilityStatus: fin.eligibilityStatus ?? "active",
      planName: patient?.coverage?.payer ?? "Aetna Choice POS II",
      planType: "PPO",
      inNetwork: true,
      deductibleCents: 150000,
      deductibleRemainingCents,
      copayCents,
      coinsurancePercent,
      outOfPocketMaxCents: 500000,
      outOfPocketRemainingCents,
      priorAuthStatus: fin.priorAuth?.status ?? "approved",
      authNumber: fin.priorAuth?.authNumber ?? "AUTH-DEMO-01",
      estimate: {
        estimatedScreeningPatientOwedCents: estimate.estimatedScreeningPatientOwedCents,
        estimatedTherapeuticPatientOwedCents: estimate.estimatedTherapeuticPatientOwedCents,
        patientResponsibilityCents: estimate.patientResponsibilityCents,
        preventiveMandateApplies: estimate.preventiveMandateApplies,
      },
      collectedCents: fin.collectedCents,
      balanceRemainingCents: clearance.balanceRemainingCents,
      hasPaymentPlan: fin.paymentPlanActive,
      overallStatus:
        clearance.overallStatus === "cleared"
          ? ("satisfied" as const)
          : clearance.overallStatus === "flagged"
            ? ("pending" as const)
            : ("failed" as const),
      isCleared: clearance.isCleared,
    };

    return HttpResponse.json(summary);
  }),

  // POST /cases/:caseId/copay-collected — Front-desk copay/deductible collection and payment plan (Phase P22a)
  // ASC billing compliance: Integer cent receipts and installment payment plan scheduling.
  http.post(apiUrl(P.caseCopayCollected), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const current = getCaseOrNull(caseId);
    if (!current) return caseNotFound(caseId);

    const raw = await body<Record<string, unknown>>(request);
    const parsed = copayCollectionSchema.safeParse({ caseId, ...raw });
    if (!parsed.success) {
      return apiError(400, API_ERROR_CODES.INVALID_PAYLOAD, "Invalid copay collection payload", formatZodError(parsed.error).details);
    }

    const fin = getCaseFinancial(caseId);
    const newTotal = fin.collectedCents + parsed.data.amountCents;
    const hasPlan = Boolean(parsed.data.paymentPlanDetails) || fin.paymentPlanActive;

    updateCaseFinancial(caseId, {
      collectedCents: newTotal,
      paymentPlanActive: hasPlan,
    });

    const nextChecks = (current.readinessChecks ?? []).map((c) => {
      if (c.name === "estimate") {
        return {
          ...c,
          status: "satisfied" as const,
          label: "Good faith estimate",
          details: `Collected $${(parsed.data.amountCents / 100).toFixed(2)} via ${parsed.data.paymentMethod}`,
        };
      }
      return c;
    });

    const nextOverall = computeOverallReadiness(nextChecks);
    updateCase(caseId, {
      readinessChecks: nextChecks,
      overallReadiness: nextOverall,
    });

    const result: CopayCollectionResult = {
      caseId,
      paidCents: parsed.data.amountCents,
      totalCollectedCents: newTotal,
      paymentMethod: parsed.data.paymentMethod,
      transactionRef: parsed.data.transactionRef ?? `tx_${Date.now()}`,
      paymentPlanActive: hasPlan,
    };

    return HttpResponse.json(result);
  }),

  // POST /cases/:caseId/prior-auth — Record and revalidate X12 278 prior authorization (Phase P22a)
  // HIPAA ANSI ASC X12 278: Health care services review, authorization window revalidation on reschedule.
  http.post(apiUrl(P.casePriorAuth), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const current = getCaseOrNull(caseId);
    if (!current) return caseNotFound(caseId);

    const raw = await body<Record<string, unknown>>(request);
    const parsed = priorAuthCheckSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(400, API_ERROR_CODES.INVALID_PAYLOAD, "Invalid prior authorization payload", formatZodError(parsed.error).details);
    }

    const procedureDate = current.scheduledStart.split("T")[0] ?? toIsoDate(new Date());
    const plannedCpt = current.procedure === "COLONOSCOPY" ? "45378" : current.procedure === "EGD" ? "43235" : "45330";

    const evaluation = evaluatePriorAuthValidity(parsed.data, procedureDate, plannedCpt);

    updateCaseFinancial(caseId, {
      priorAuth: {
        authNumber: parsed.data.authNumber,
        status: parsed.data.status,
        validFrom: parsed.data.validFrom,
        validTo: parsed.data.validTo,
        approvedCptCodes: parsed.data.approvedCptCodes,
        approvedUnits: parsed.data.approvedUnits,
      },
    });

    const authReadinessStatus: ReadinessCheckStatus =
      evaluation.status === "not_required" ? "satisfied" : evaluation.status;

    const nextChecks = (current.readinessChecks ?? []).map((c) => {
      if (c.name === "authorization") {
        return {
          ...c,
          status: authReadinessStatus,
          label: "Prior authorization",
          details: evaluation.reason,
        };
      }
      return c;
    });

    const nextOverall = computeOverallReadiness(nextChecks);
    updateCase(caseId, {
      readinessChecks: nextChecks,
      overallReadiness: nextOverall,
    });

    const result: PriorAuthResult = {
      priorAuth: {
        authNumber: parsed.data.authNumber,
        status: parsed.data.status,
        validFrom: parsed.data.validFrom,
        validTo: parsed.data.validTo,
        approvedCptCodes: parsed.data.approvedCptCodes,
        approvedUnits: parsed.data.approvedUnits,
        notes: parsed.data.notes,
      },
      evaluation,
    };

    return HttpResponse.json(result);
  }),
];
