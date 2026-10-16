import { randomUUID } from "node:crypto";
import { forFacility } from "@asc/api-client/server";
import { timeOutGate, evaluateGate2 } from "@asc/clinical-rules/gates";
import { evaluateScopeAssignment } from "@asc/clinical-rules/scope-lock";
import { evaluateWithdrawalQuality } from "@asc/clinical-rules/scores";
import {
  buildGate2OverrideObservation,
  buildProcedureEventObservation,
  buildScopeVerificationObservation,
  buildSurgicalTimeOutObservation,
  buildWithdrawalTimeObservation,
} from "@asc/fhir";
import type {
  CaseDetail,
  Gate2OverrideRecord,
  ProcedureEvent,
  RuleReason,
  ScopeAssignmentRecord,
  StaffRef,
  TimeOutParticipant,
  TimeOutParticipantRole,
  TimeOutRecord,
} from "@asc/types";
import type {
  AssignScopeInput,
  Gate2OverrideInput,
  RecordProcedureEventInput,
  SignTimeOutInput,
} from "@asc/validation";
import type { MedplumClient } from "@medplum/core";
import type { FastifyBaseLogger } from "fastify";

import { getCaseDetail } from "./case-read-service.js";

type ProcedureCaptureResult<T> =
  | { readonly status: 200; readonly data: T }
  | { readonly status: 404; readonly code: "not_found"; readonly message: string }
  | { readonly status: 409; readonly code: "GATE_FAILED" | "SCOPE_LOCK_VIOLATION"; readonly message: string; readonly reasons?: readonly RuleReason[] }
  | { readonly status: 403; readonly code: "forbidden"; readonly message: string };

const PERMITTED_G2_OVERRIDE_ROLES: Readonly<Record<string, boolean>> = {
  "gi-physician": true,
  anesthesia: true,
  "attending-physician": true,
  anesthesiologist: true,
};

const LEGACY_TIMEOUT_ROLE_MAP: Readonly<Record<string, TimeOutParticipantRole>> = {
  SURGEON: "endoscopist",
  ANESTHESIOLOGIST: "anesthesia",
};

/**
 * Records surgical time-out verification (CMS 42 CFR § 416.52, UP.01.03.01).
 */
export async function recordCaseTimeOut(params: {
  medplum: MedplumClient;
  facilityId: string;
  caseId: string;
  input: SignTimeOutInput;
  actor: { id: string; name: string; role?: string };
  logger: FastifyBaseLogger;
}): Promise<ProcedureCaptureResult<CaseDetail>> {
  const { medplum, facilityId, caseId, input, actor, logger } = params;

  const currentDetail = await getCaseDetail({ medplum, facilityId, caseId });
  if (!currentDetail) {
    return { status: 404, code: "not_found", message: `Case ${caseId} not found` };
  }

  const nowIso = input.completedAt ?? new Date().toISOString();
  let participants: readonly TimeOutParticipant[];

  if (input.participants && input.participants.length > 0) {
    participants = input.participants.map((p) => ({
      userId: p.userId,
      name: p.name,
      role: p.role,
      acknowledgedAt: p.acknowledgedAt ?? nowIso,
    }));
  } else {
    const role: TimeOutParticipantRole =
      (input.role ? LEGACY_TIMEOUT_ROLE_MAP[input.role] : undefined) ?? "circulating_rn";

    const newParticipant: TimeOutParticipant = {
      userId: actor.id,
      name: actor.name,
      role,
      acknowledgedAt: nowIso,
    };

    const existing = currentDetail.timeOut.participants ?? [];
    const merged = existing.filter((p) => p.userId !== actor.id);
    merged.push(newParticipant);
    participants = merged;
  }

  const timeOutRecord: TimeOutRecord = {
    caseId,
    checklist: {
      patientIdentity: input.checklist.patientIdentity,
      procedureConfirmed: input.checklist.procedureConfirmed,
      consentVerified: input.checklist.consentVerified,
      allergiesReviewed: input.checklist.allergiesReviewed,
      equipmentReady: input.checklist.equipmentReady,
      anticoagulationReviewed: input.checklist.anticoagulationReviewed,
      ...(input.checklist.siteAndLateralityConfirmed !== undefined ? { siteAndLateralityConfirmed: input.checklist.siteAndLateralityConfirmed } : {}),
      ...(input.checklist.prophylaxisReviewed !== undefined ? { prophylaxisReviewed: input.checklist.prophylaxisReviewed } : {}),
      ...(input.checklist.anticipatedIssuesReviewed !== undefined ? { anticipatedIssuesReviewed: input.checklist.anticipatedIssuesReviewed } : {}),
    },
    attestations: [],
    participants,
    completedAt: nowIso,
  };

  const gateResult = timeOutGate(timeOutRecord);
  if (!gateResult.ok) {
    logger.warn({ caseId, reasonCodes: gateResult.reasons.map((r) => r.code) }, "timeout rejected by timeOutGate");
    return {
      status: 409,
      code: "GATE_FAILED",
      message: gateResult.reasons[0]?.message ?? "Time-out verification is incomplete",
      reasons: gateResult.reasons,
    };
  }

  const obs = buildSurgicalTimeOutObservation({
    facilityId,
    caseId,
    patientId: currentDetail.patient.id,
    checklist: timeOutRecord.checklist,
    participants,
    completedAt: nowIso,
  });

  await forFacility(medplum, facilityId).create(obs);

  const updatedDetail = await getCaseDetail({ medplum, facilityId, caseId });
  return { status: 200, data: updatedDetail ?? currentDetail };
}

/**
 * Records intra-op procedure event (ROOM_IN, SCOPE_IN, CECUM_REACHED, SCOPE_OUT, etc.).
 * Enforces timeout before SCOPE_IN / SEDATION_START and verified scope before SCOPE_IN.
 * Automatically computes withdrawal time on SCOPE_OUT if CECUM_REACHED was documented.
 */
export async function recordCaseProcedureEvent(params: {
  medplum: MedplumClient;
  facilityId: string;
  caseId: string;
  input: RecordProcedureEventInput;
  actor: { id: string; name: string };
  logger: FastifyBaseLogger;
}): Promise<ProcedureCaptureResult<CaseDetail>> {
  const { medplum, facilityId, caseId, input, actor } = params;

  const currentDetail = await getCaseDetail({ medplum, facilityId, caseId });
  if (!currentDetail) {
    return { status: 404, code: "not_found", message: `Case ${caseId} not found` };
  }

  // Pre-requisite checks
  if (input.type === "SCOPE_IN" || input.type === "SEDATION_START") {
    if (!currentDetail.case.readiness.timeOutComplete) {
      return {
        status: 409,
        code: "GATE_FAILED",
        message: "Surgical timeout must be completed before sedation start or scope insertion (UP.01.03.01).",
      };
    }
  }

  if (input.type === "SCOPE_IN") {
    if (!currentDetail.scopeAssignment) {
      return {
        status: 409,
        code: "GATE_FAILED",
        message: "A verified endoscope must be assigned before scope insertion (CMS 42 CFR § 416.51).",
      };
    }
    if (!currentDetail.scopeAssignment.withinHangTimeWindow) {
      return {
        status: 409,
        code: "GATE_FAILED",
        message: "Assigned endoscope hang-time exceeded 168 hours. Scope lock is active.",
      };
    }
  }

  const eventTime = input.at ?? input.recordedAt ?? new Date().toISOString();
  const eventId = `evt-${randomUUID()}`;
  const staff: StaffRef = {
    id: actor.id,
    name: actor.name,
    initials: actor.name.slice(0, 2).toUpperCase(),
  };

  const event: ProcedureEvent = {
    id: eventId,
    caseId,
    type: input.type,
    at: eventTime,
    by: staff,
    ...(input.note !== undefined ? { note: input.note } : {}),
  };

  const obs = buildProcedureEventObservation({
    facilityId,
    caseId,
    patientId: currentDetail.patient.id,
    event,
  });

  await forFacility(medplum, facilityId).create(obs);

  // Auto-compute withdrawal time when SCOPE_OUT is recorded following CECUM_REACHED
  if (input.type === "SCOPE_OUT") {
    const withdrawalStart =
      currentDetail.events.find((e) => e.type === "WITHDRAWAL_START") ??
      currentDetail.events.find((e) => e.type === "CECUM_REACHED");

    if (withdrawalStart) {
      try {
        const quality = evaluateWithdrawalQuality(withdrawalStart.at, eventTime);
        const wtObs = buildWithdrawalTimeObservation({
          facilityId,
          caseId,
          patientId: currentDetail.patient.id,
          withdrawalTimeMinutes: quality.withdrawalMinutes,
          meetsQualityBenchmark: quality.meetsBenchmark,
          recordedAt: eventTime,
          performerId: actor.id,
        });
        await forFacility(medplum, facilityId).create(wtObs);
      } catch {
        // Log or ignore invalid timestamp during auto-computation
      }
    }
  }

  const updatedDetail = await getCaseDetail({ medplum, facilityId, caseId });
  return { status: 200, data: updatedDetail ?? currentDetail };
}

/**
 * Assigns an endoscope to the case after verifying decontamination, leak test,
 * and 168-hour hang-time compliance (ANSI/AAMI ST91:2021 & CMS 42 CFR § 416.51).
 */
export async function assignCaseScope(params: {
  medplum: MedplumClient;
  facilityId: string;
  caseId: string;
  input: AssignScopeInput;
  actor: { id: string; name: string };
  logger: FastifyBaseLogger;
}): Promise<ProcedureCaptureResult<CaseDetail>> {
  const { medplum, facilityId, caseId, input, actor, logger } = params;

  const currentDetail = await getCaseDetail({ medplum, facilityId, caseId });
  if (!currentDetail) {
    return { status: 404, code: "not_found", message: `Case ${caseId} not found` };
  }

  const assignedAt = input.assignedAt ?? new Date().toISOString();
  const evalResult = evaluateScopeAssignment({
    scopeSerial: input.scopeSerial,
    ...(input.scopeModel !== undefined ? { scopeModel: input.scopeModel } : {}),
    reprocessedAt: input.reprocessedAt,
    leakTestResult: input.leakTestResult,
    cycleOutcome: input.cycleOutcome,
    assignedAt,
  });

  if (!evalResult.ok) {
    logger.warn({ caseId, serial: input.scopeSerial, reasons: evalResult.reasons }, "scope assignment failed validation");
    const reasons: readonly RuleReason[] = evalResult.reasons.map((msg, idx) => ({
      code: evalResult.blockerCodes[idx] ?? "SCOPE_LOCK_VIOLATION",
      message: msg,
    }));
    return {
      status: 409,
      code: "GATE_FAILED",
      message: evalResult.reasons[0] ?? "Scope assignment verification failed",
      reasons,
    };
  }

  const reprocessedMs = Date.parse(input.reprocessedAt);
  const assignedMs = Date.parse(assignedAt);
  const hangTimeHours = Math.round(((assignedMs - reprocessedMs) / (1000 * 60 * 60)) * 10) / 10;

  const staff: StaffRef = {
    id: actor.id,
    name: actor.name,
    initials: actor.name.slice(0, 2).toUpperCase(),
  };

  const scopeRecord: ScopeAssignmentRecord = {
    scopeSerial: input.scopeSerial,
    ...(input.scopeModel !== undefined ? { scopeModel: input.scopeModel } : {}),
    reprocessedAt: input.reprocessedAt,
    assignedAt,
    assignedBy: staff,
    leakTestResult: input.leakTestResult,
    cycleOutcome: input.cycleOutcome,
    hangTimeHours,
    withinHangTimeWindow: true,
  };

  const obs = buildScopeVerificationObservation({
    facilityId,
    caseId,
    patientId: currentDetail.patient.id,
    scopeAssignment: scopeRecord,
  });

  await forFacility(medplum, facilityId).create(obs);

  const updatedDetail = await getCaseDetail({ medplum, facilityId, caseId });
  return { status: 200, data: updatedDetail ?? currentDetail };
}

/**
 * Records a clinical override for Gate 2 intra-op safety blockers.
 * Permitted only for attending GI physicians and anesthesiologists.
 * Non-overridable lock enforced on active scope hang-time/reprocessing violations (AC-I-05-4).
 */
export async function overrideCaseGate2(params: {
  medplum: MedplumClient;
  facilityId: string;
  caseId: string;
  input: Gate2OverrideInput;
  actor: { id: string; name: string; role?: string };
  logger: FastifyBaseLogger;
}): Promise<ProcedureCaptureResult<CaseDetail>> {
  const { medplum, facilityId, caseId, input, actor, logger } = params;

  const currentDetail = await getCaseDetail({ medplum, facilityId, caseId });
  if (!currentDetail) {
    return { status: 404, code: "not_found", message: `Case ${caseId} not found` };
  }

  const actorRole = input.actorRole ?? actor.role ?? "";
  if (!PERMITTED_G2_OVERRIDE_ROLES[actorRole]) {
    return {
      status: 403,
      code: "forbidden",
      message: "Only attending GI physicians and anesthesiologists may override Gate 2 safety blockers.",
    };
  }

  const hasActiveScopeViolation = currentDetail.scopeAssignment
    ? !currentDetail.scopeAssignment.withinHangTimeWindow ||
      currentDetail.scopeAssignment.leakTestResult === "FAIL" ||
      currentDetail.scopeAssignment.cycleOutcome === "FAIL"
    : false;

  if (hasActiveScopeViolation) {
    logger.warn({ caseId, actorRole }, "Gate 2 override rejected due to active scope lock violation");
    return {
      status: 409,
      code: "SCOPE_LOCK_VIOLATION",
      message: "Active endoscope reprocessing or hang-time violation cannot be overridden (AC-I-05-4).",
    };
  }

  const g2Result = evaluateGate2(currentDetail.case.readinessChecks ?? []);
  const blockerCodes = (g2Result.checks ?? []).filter((c) => !c.ok).map((c) => c.code);

  const overriddenAt = input.overriddenAt ?? new Date().toISOString();
  const overrideRecord: Gate2OverrideRecord = {
    overriddenAt,
    actorId: actor.id,
    actorName: input.actorName || actor.name,
    actorRole,
    reason: input.reason,
    overriddenBlockers: blockerCodes,
  };

  const obs = buildGate2OverrideObservation({
    facilityId,
    caseId,
    patientId: currentDetail.patient.id,
    override: overrideRecord,
  });

  await forFacility(medplum, facilityId).create(obs);

  const updatedDetail = await getCaseDetail({ medplum, facilityId, caseId });
  return { status: 200, data: updatedDetail ?? currentDetail };
}
