import {
  computeOverallReadiness,
  isCheckSatisfiedOrWaived,
  mapReadinessChecks,
} from "@asc/clinical-rules/readiness";
import { STAGE_FROM_PHASE } from "@asc/clinical-rules/phases";
import {
  readCasePhase,
  readCaseReadiness,
  readCaseStage,
  readProcedureIntent,
} from "@asc/fhir";
import { casePhaseFromCode } from "@asc/fhir/case-phase";
import { caseStageFromCode } from "@asc/fhir/case-stage";
import type {
  CasePhase,
  CaseStage,
  CaseTeam,
  IsoDateTime,
  Patient,
  PatientRef,
  ProcedureCase,
  ProcedureCode,
  ProcedureIntent,
  ReadinessFlags,
  StaffRef,
} from "@asc/types";
import type { Appointment, Encounter, Patient as FhirPatient, ServiceRequest } from "@medplum/fhirtypes";

export function computeAge(dateOfBirth?: string): number {
  if (!dateOfBirth) return 0;
  const datePart = dateOfBirth.split("T")[0] ?? "";
  const [y, m, d] = datePart.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d) || (y ?? 0) <= 0) {
    const parsed = Date.parse(dateOfBirth);
    if (Number.isNaN(parsed)) return 0;
    const parsedDate = new Date(parsed);
    const today = new Date();
    let age = today.getFullYear() - parsedDate.getFullYear();
    const mDiff = today.getMonth() - parsedDate.getMonth();
    if (mDiff < 0 || (mDiff === 0 && today.getDate() < parsedDate.getDate())) age--;
    return Math.max(0, age);
  }
  const today = new Date();
  let age = today.getFullYear() - (y ?? 0);
  const monthDiff = today.getMonth() + 1 - (m ?? 1);
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < (d ?? 1))) age--;
  return Math.max(0, age);
}

export function extractPatientInitials(givenName?: string, familyName?: string, fallbackDisplay?: string): string {
  const g = givenName?.trim() ? givenName.trim()[0]?.toUpperCase() : undefined;
  const f = familyName?.trim() ? familyName.trim()[0]?.toUpperCase() : undefined;
  if (g && f) {
    return `${g}.${f}.`;
  }
  if (fallbackDisplay?.trim()) {
    const parts = fallbackDisplay.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const p0 = parts[0]?.[0]?.toUpperCase() ?? "P";
      const p1 = parts[parts.length - 1]?.[0]?.toUpperCase() ?? "T";
      return `${p0}.${p1}.`;
    }
    if (parts.length === 1 && parts[0]) {
      const word = parts[0];
      if (word.length >= 2) {
        return `${word[0]?.toUpperCase() ?? "P"}.${word[1]?.toUpperCase() ?? "T"}.`;
      }
      return `${word[0]?.toUpperCase() ?? "P"}.T.`;
    }
  }
  if (g) return `${g}.T.`;
  if (f) return `P.${f}.`;
  return "P.T.";
}

export function extractPractitionerStaffRef(display?: string, ref?: string, defaultRole = "Staff"): StaffRef {
  const id = ref?.replace("Practitioner/", "") ?? "staff-1";
  const name = display?.trim() ? display.trim() : defaultRole;
  const parts = name.replace(/^(Dr\.|Doctor)\s+/i, "").trim().split(/\s+/).filter(Boolean);
  let initials = "MD";
  if (parts.length >= 2) {
    const c0 = parts[0]?.[0]?.toUpperCase() ?? "M";
    const c1 = parts[parts.length - 1]?.[0]?.toUpperCase() ?? "D";
    initials = `${c0}${c1}`;
  } else if (parts[0] && parts[0].length >= 2) {
    initials = parts[0].slice(0, 2).toUpperCase();
  }
  return { id, name, initials };
}

export const STAGE_TO_PHASE: Readonly<Record<string, CasePhase>> = {
  requested: "SCHEDULED",
  scheduled: "SCHEDULED",
  confirmed: "CONFIRMED",
  arrived: "ARRIVED",
  preop: "PRE_OP",
  "in-room": "READY_FOR_PROCEDURE",
  in_room: "READY_FOR_PROCEDURE",
  "procedure-start": "IN_PROCEDURE",
  procedure_start: "IN_PROCEDURE",
  "procedure-end": "IN_PROCEDURE",
  procedure_end: "IN_PROCEDURE",
  pacu: "RECOVERY",
  discharged: "DISCHARGED",
  cancelled: "CANCELLED",
  "no-show": "NO_SHOW",
  no_show: "NO_SHOW",
};

export const PHASE_TO_STAGE: Readonly<Record<CasePhase, CaseStage>> = {
  ...STAGE_FROM_PHASE,
  READY_FOR_PROCEDURE: "in_room",
};

export function resolveTransitionTarget(target: string): {
  canonicalTarget: CasePhase | CaseStage;
  matchedStage: CaseStage | undefined;
  matchedPhase: CasePhase | undefined;
} {
  const trimmed = target.trim();
  const stage = caseStageFromCode(trimmed);
  if (stage !== undefined) {
    return {
      canonicalTarget: stage,
      matchedStage: stage,
      matchedPhase: STAGE_TO_PHASE[stage],
    };
  }

  if (Object.hasOwn(PHASE_TO_STAGE, trimmed)) {
    const phase = trimmed as CasePhase;
    return {
      canonicalTarget: phase,
      matchedStage: PHASE_TO_STAGE[phase],
      matchedPhase: phase,
    };
  }

  const phaseFromCode = casePhaseFromCode(trimmed);
  if (phaseFromCode !== undefined) {
    return {
      canonicalTarget: phaseFromCode,
      matchedStage: PHASE_TO_STAGE[phaseFromCode],
      matchedPhase: phaseFromCode,
    };
  }

  return {
    canonicalTarget: trimmed as CasePhase | CaseStage,
    matchedStage: undefined,
    matchedPhase: undefined,
  };
}

const STATUS_TO_PHASE: Readonly<Record<string, CasePhase>> = {
  planned: "SCHEDULED",
  arrived: "ARRIVED",
  "in-progress": "IN_PROCEDURE",
  onleave: "RECOVERY",
  finished: "DISCHARGED",
  cancelled: "CANCELLED",
  "entered-in-error": "CANCELLED",
};

export function resolveCaseStage(encounter?: Encounter): CaseStage | undefined {
  if (!encounter) return undefined;
  const directStage = readCaseStage(encounter.extension);
  if (directStage) return directStage;
  const stageExt = encounter.extension?.find((e) =>
    e.url?.includes("case-stage") || e.url?.endsWith("/case-stage"),
  );
  const stageCode = stageExt?.valueCoding?.code ?? stageExt?.valueCode;
  return stageCode ? caseStageFromCode(stageCode) : undefined;
}

export function resolveCasePhase(encounter?: Encounter): CasePhase {
  if (!encounter) return "SCHEDULED";
  const stage = resolveCaseStage(encounter);
  if (stage && Object.hasOwn(STAGE_TO_PHASE, stage)) {
    const mapped = STAGE_TO_PHASE[stage];
    if (mapped) return mapped;
  }

  const directPhase = readCasePhase(encounter.extension);
  if (directPhase) return directPhase;

  const phaseExt = encounter.extension?.find((e) =>
    e.url?.includes("case-phase") || e.url?.endsWith("/case-phase"),
  );
  const phaseCode = phaseExt?.valueCoding?.code ?? phaseExt?.valueCode;
  if (phaseCode) {
    const parsed = casePhaseFromCode(phaseCode);
    if (parsed) return parsed;
  }

  return (encounter.status && Object.hasOwn(STATUS_TO_PHASE, encounter.status)
    ? STATUS_TO_PHASE[encounter.status]
    : undefined) ?? "SCHEDULED";
}

export function formatCanonicalCaseNumber(rawNumber?: string, fallbackId?: string): string {
  if (rawNumber && rawNumber.trim()) {
    const trimmed = rawNumber.trim();
    return trimmed.startsWith("CASE-") ? trimmed : `CASE-${trimmed}`;
  }
  const cleanId = (fallbackId ?? "000000").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return `CASE-${cleanId.slice(0, 6)}`;
}

export function procedureCodeAndLabel(description?: string, cptCode?: string): { code: ProcedureCode; label: string } {
  const text = `${description ?? ""} ${cptCode ?? ""}`.toUpperCase();
  if (text.includes("EGD") && text.includes("COLON")) {
    return { code: "EGD_COLONOSCOPY", label: "Bidirectional endoscopy (EGD + colonoscopy)" };
  }
  if (text.includes("EGD") || text.includes("43235") || text.includes("43239")) {
    return { code: "EGD", label: "Esophagogastroduodenoscopy (EGD)" };
  }
  if (text.includes("SIG") || text.includes("45330")) {
    return { code: "FLEX_SIG", label: "Flexible sigmoidoscopy" };
  }
  return { code: "COLONOSCOPY", label: "Colonoscopy" };
}

export function buildPatientFromFhir(patient: FhirPatient): Patient {
  const id = patient.id ?? "pat-unknown";
  const mrn = patient.identifier?.find((i) => i.system?.includes("mrn"))?.value ?? `MRN-${id.slice(0, 6).toUpperCase()}`;
  const addressItem = patient.address?.[0];
  return {
    id,
    mrn,
    firstName: patient.name?.[0]?.given?.[0] ?? "Unknown",
    lastName: patient.name?.[0]?.family ?? "Unknown",
    dateOfBirth: patient.birthDate ?? "1980-01-01",
    sex: patient.gender === "female" ? "F" : "M",
    phone: patient.telecom?.find((t) => t.system === "phone")?.value ?? "(555) 000-0000",
    email: patient.telecom?.find((t) => t.system === "email")?.value,
    address: addressItem
      ? { line: addressItem.line?.[0] ?? "", city: addressItem.city ?? "", state: addressItem.state ?? "", postalCode: addressItem.postalCode ?? "" }
      : undefined,
    preferredLanguage: patient.communication?.[0]?.language?.text ?? "English",
    coverage: null,
    escort: null,
    allergies: [],
    medications: [],
    createdAt: patient.meta?.lastUpdated ?? new Date().toISOString(),
  };
}

export function buildProcedureCaseFromFhir(params: {
  appItem?: Appointment;
  encounter?: Encounter;
  fhirPatient?: FhirPatient;
  serviceRequest?: ServiceRequest;
}): ProcedureCase {
  const { appItem, encounter, fhirPatient, serviceRequest } = params;

  const roomRef = appItem?.participant?.find((p) => p.actor?.reference?.startsWith("Location/"));
  const roomId = roomRef?.actor?.reference
    ? roomRef.actor.reference.replace("Location/", "")
    : encounter?.location?.[0]?.location?.reference?.replace("Location/", "") ?? "room-1";

  const patientParticipant = appItem?.participant?.find((p) => p.actor?.reference?.startsWith("Patient/"));
  const patientId =
    patientParticipant?.actor?.reference?.replace("Patient/", "") ??
    encounter?.subject?.reference?.replace("Patient/", "") ??
    fhirPatient?.id ??
    "patient-unknown";

  const givenName = fhirPatient?.name?.[0]?.given?.[0];
  const familyName = fhirPatient?.name?.[0]?.family;
  const fullNameFromPatient = [givenName, familyName].filter(Boolean).join(" ").trim();
  const displayName =
    patientParticipant?.actor?.display?.trim() ||
    fullNameFromPatient ||
    "Unknown Patient";
  const birthDate = fhirPatient?.birthDate;

  const patientRef: PatientRef = {
    id: patientId,
    mrn: fhirPatient?.identifier?.find((i) => i.system?.includes("mrn"))?.value ?? `MRN-${patientId.slice(0, 6).toUpperCase()}`,
    displayName,
    initials: extractPatientInitials(givenName, familyName, displayName),
    age: computeAge(birthDate),
    sex: fhirPatient?.gender === "female" ? "F" : "M",
    dateOfBirth: birthDate ?? "1980-01-01",
  };

  const docRef = appItem?.participant?.find((p) => p.type?.some((t) => t.coding?.some((c) => c.code === "PPRF")))
    ?? appItem?.participant?.find((p) => p.actor?.reference?.startsWith("Practitioner/") && !p.actor.reference.includes("anes"));
  const anesRef = appItem?.participant?.find((p) => p.type?.some((t) => t.coding?.some((c) => c.code === "SPRF")))
    ?? appItem?.participant?.find((p) => p.actor?.reference?.startsWith("Practitioner/") && (p.actor.reference.includes("anes") || p.actor.display?.toLowerCase().includes("anesthes")));
  const nurseRef = appItem?.participant?.find((p) => p.type?.some((t) => t.coding?.some((c) => c.code === "ATND" || c.code === "CON")))
    ?? appItem?.participant?.find((p) => p.actor?.reference?.startsWith("Practitioner/") && p.actor.reference.includes("nurse"));

  const team: CaseTeam = {
    surgeon: extractPractitionerStaffRef(docRef?.actor?.display, docRef?.actor?.reference ?? serviceRequest?.requester?.reference, "Surgeon"),
    anesthesia: extractPractitionerStaffRef(anesRef?.actor?.display, anesRef?.actor?.reference, "Anesthesiologist"),
    nurse: extractPractitionerStaffRef(nurseRef?.actor?.display, nurseRef?.actor?.reference, "Circulating Nurse"),
  };

  const phase = resolveCasePhase(encounter);
  const stage = resolveCaseStage(encounter);
  const caseId = encounter?.id ?? appItem?.id ?? "case-unknown";
  const caseNumber = formatCanonicalCaseNumber(encounter?.identifier?.find((id) => id.system?.includes("case-number"))?.value, caseId);
  const cptCode = serviceRequest?.code?.coding?.[0]?.code;
  const description = appItem?.description ?? serviceRequest?.note?.[0]?.text;
  const { code: procedure, label: procedureLabel } = procedureCodeAndLabel(description, cptCode);

  const scheduledStart = appItem?.start ?? encounter?.period?.start ?? new Date().toISOString();
  const rawDuration =
    appItem?.start && appItem?.end
      ? Math.round((Date.parse(appItem.end) - Date.parse(appItem.start)) / 60_000)
      : 45;
  const durationMin = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 45;

  const readinessChecks = encounter ? readCaseReadiness(encounter.extension) : [];
  const checkMap = mapReadinessChecks(readinessChecks);
  const overallReadiness = computeOverallReadiness(readinessChecks);

  const readiness: ReadinessFlags = {
    prepConfirmed: isCheckSatisfiedOrWaived(checkMap.get("prep")),
    eligibilityActive: isCheckSatisfiedOrWaived(checkMap.get("coverage")),
    hpCurrent: isCheckSatisfiedOrWaived(checkMap.get("hp")),
    asaSet: isCheckSatisfiedOrWaived(checkMap.get("anesthesia_clearance")),
    consentsSigned: isCheckSatisfiedOrWaived(checkMap.get("consent")),
    holdsConfirmed: isCheckSatisfiedOrWaived(checkMap.get("anticoagulation")),
    escortConfirmed: isCheckSatisfiedOrWaived(checkMap.get("escort")),
    npoConfirmed: isCheckSatisfiedOrWaived(checkMap.get("prep")),
    ivPlaced: Boolean(encounter?.extension?.some((e) => e.url?.includes("preop-iv-placement"))),
    timeOutComplete: false,
  };

  const timestamps: Partial<Record<CasePhase, IsoDateTime>> = { [phase]: encounter?.period?.start ?? scheduledStart };
  const timestampsExt = encounter?.extension?.find((e) => e.url?.includes("case-stage-timestamps"));
  const stageTimestamps: Partial<Record<CaseStage, IsoDateTime>> = {};
  if (timestampsExt?.extension) {
    for (const sub of timestampsExt.extension) {
      if (sub.url && sub.valueDateTime) {
        stageTimestamps[sub.url as CaseStage] = sub.valueDateTime;
      }
    }
  }
  if (stage && !stageTimestamps[stage]) {
    stageTimestamps[stage] = encounter?.period?.start ?? scheduledStart;
  }

  const intent: ProcedureIntent =
    (serviceRequest?.extension ? readProcedureIntent(serviceRequest.extension) : undefined) ?? "screening";

  return {
    id: caseId,
    caseNumber,
    patientId,
    patient: patientRef,
    procedure,
    procedureLabel,
    intent,
    indication: description?.trim() ? description.trim() : "Screening examination",
    roomId,
    scheduledStart,
    durationMin,
    team,
    phase,
    ...(stage ? { stage } : {}),
    timestamps,
    stageTimestamps,
    readiness,
    readinessChecks,
    overallReadiness,
  };
}
