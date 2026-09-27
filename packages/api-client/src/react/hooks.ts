import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AuditQuery, IsoDate, PatientSearchQuery, WorklistQuery } from "@asc/types";
import {
  addAnesthesiaEntry,
  addImage,
  addNarration,
  addProcedureEvent,
  addSpecimen,
  approveDischargeInstructions,
  attestCoding,
  attestTimeOut,
  bookCase,
  checkDuplicatePatient,
  checkEligibility,
  checkInCase,
  checkScheduleConflicts,
  completeWorkItem,
  convertReferral,
  createPatient,
  dischargeCase,
  exportCharges,
  generateDischargeInstructions,
  getAdminOverview,
  getAuditLog,
  getCase,
  getCoding,
  getCodingQueue,
  getDashboardSummary,
  getMyCare,
  getNote,
  getPathology,
  getPathologyQueue,
  getPatient,
  getQualityMetrics,
  getReferral,
  getSchedule,
  getWhiteboard,
  getWorklist,
  listPatients,
  listReferrals,
  reconcilePathology,
  recordBbps,
  recordPathologyResult,
  resetDemo,
  resolveGapChip,
  saveAldrete,
  saveHp,
  savePreOp,
  saveVitals,
  searchAll,
  sendResultLetter,
  setSurveillance,
  signConsent,
  signNote,
  transitionCase,
  updateCodingStatus,
  updateCriticSuggestion,
  updateEscort,
  updateMyEscort,
  updateNoteSection,
  updatePrepItem,
} from "../clinical";
import type {
  AddImagePayload,
  AddSpecimenPayload,
  ConvertReferralPayload,
  ExportChargesPayload,
  RecordPathologyPayload,
  ReconcilePathologyPayload,
  ResolveGapChipPayload,
  SendResultLetterPayload,
  SetSurveillancePayload,
  UpdateCodingStatusPayload,
  UpdateCriticSuggestionPayload,
  UpdateEscortPayload,
  UpdateNoteSectionPayload,
} from "@asc/types";
import { useCaseCommand, useClinicalMutation } from "./mutation";
import { queryKeys } from "./query-keys";

/** Live-ish views refetch on this interval (Medplum Subscriptions replace it in P05+). */
export const LIVE_REFETCH_MS = 15_000;
const SEARCH_MIN_LENGTH = 2;

// ─── Patients & referrals ───────────────────────────────────────────────────

export function usePatients(query: PatientSearchQuery = {}) {
  return useQuery({ queryKey: queryKeys.patients.list(query), queryFn: () => listPatients(query), placeholderData: keepPreviousData });
}

export function usePatient(patientId: string) {
  return useQuery({ queryKey: queryKeys.patients.detail(patientId), queryFn: () => getPatient(patientId) });
}

export const useCreatePatient = () => useClinicalMutation(createPatient);
export const useDuplicateCheck = () => useClinicalMutation(checkDuplicatePatient);
export const useCheckEligibility = () => useClinicalMutation(checkEligibility);
export const useUpdateEscort = (patientId: string) =>
  useClinicalMutation((payload: UpdateEscortPayload) => updateEscort(patientId, payload));

export function useReferrals() {
  return useQuery({ queryKey: queryKeys.referrals.list, queryFn: listReferrals });
}

export function useReferral(referralId: string | null) {
  return useQuery({
    queryKey: queryKeys.referrals.detail(referralId ?? ""),
    queryFn: () => getReferral(referralId ?? ""),
    enabled: referralId !== null,
  });
}

export const useConvertReferral = (referralId: string) =>
  useClinicalMutation((payload: ConvertReferralPayload) => convertReferral(referralId, payload));

// ─── Schedule & case workspace ──────────────────────────────────────────────

export function useSchedule(date?: IsoDate) {
  return useQuery({ queryKey: queryKeys.schedule.day(date), queryFn: () => getSchedule(date), placeholderData: keepPreviousData });
}

export const useBookCase = () => useClinicalMutation(bookCase);
export const useScheduleConflictCheck = () => useClinicalMutation(checkScheduleConflicts);

export function useCase(caseId: string) {
  return useQuery({ queryKey: queryKeys.cases.detail(caseId), queryFn: () => getCase(caseId) });
}

export const useTransitionCase = (caseId: string) => useCaseCommand(caseId, transitionCase);
export const useCheckIn = (caseId: string) => useCaseCommand(caseId, checkInCase);
export const useSaveHp = (caseId: string) => useCaseCommand(caseId, saveHp);
export const useSavePreOp = (caseId: string) => useCaseCommand(caseId, savePreOp);
export const useSaveVitals = (caseId: string) => useCaseCommand(caseId, saveVitals);
export const useSignConsent = (caseId: string) => useCaseCommand(caseId, signConsent);
export const useAttestTimeOut = (caseId: string) => useCaseCommand(caseId, attestTimeOut);
export const useAddProcedureEvent = (caseId: string) => useCaseCommand(caseId, addProcedureEvent);
export const useRecordBbps = (caseId: string) => useCaseCommand(caseId, recordBbps);
export const useAddNarration = (caseId: string) => useCaseCommand(caseId, addNarration);
export const useAddSpecimen = (caseId: string) => useCaseCommand(caseId, (id, payload: AddSpecimenPayload) => addSpecimen(id, payload));
export const useAddImage = (caseId: string) => useCaseCommand(caseId, (id, payload: AddImagePayload) => addImage(id, payload));
export const useAddAnesthesiaEntry = (caseId: string) => useCaseCommand(caseId, addAnesthesiaEntry);

// ─── AI note (streaming lives in useNoteGeneration) ─────────────────────────

export function useNote(caseId: string) {
  return useQuery({ queryKey: queryKeys.cases.note(caseId), queryFn: () => getNote(caseId) });
}

export const useUpdateNoteSection = (caseId: string) =>
  useClinicalMutation((payload: UpdateNoteSectionPayload) => updateNoteSection(caseId, payload));
export const useResolveGapChip = (caseId: string) =>
  useClinicalMutation((payload: ResolveGapChipPayload) => resolveGapChip(caseId, payload));
export const useUpdateCriticSuggestion = (caseId: string) =>
  useClinicalMutation((payload: UpdateCriticSuggestionPayload) => updateCriticSuggestion(caseId, payload));
export const useSignNote = (caseId: string) => useClinicalMutation(() => signNote(caseId));

// ─── Recovery, coding, pathology ────────────────────────────────────────────

export const useSaveAldrete = (caseId: string) => useCaseCommand(caseId, saveAldrete);
export const useGenerateDischargeInstructions = (caseId: string) =>
  useClinicalMutation(() => generateDischargeInstructions(caseId));
export const useApproveDischargeInstructions = (caseId: string) =>
  useClinicalMutation(() => approveDischargeInstructions(caseId));
export const useDischargeCase = (caseId: string) => useCaseCommand(caseId, dischargeCase);

export function useCoding(caseId: string) {
  return useQuery({ queryKey: queryKeys.cases.coding(caseId), queryFn: () => getCoding(caseId) });
}

export const useUpdateCodingStatus = (caseId: string) =>
  useClinicalMutation((payload: UpdateCodingStatusPayload) => updateCodingStatus(caseId, payload));
export const useAttestCoding = (caseId: string) => useClinicalMutation(() => attestCoding(caseId));
export const useExportCharges = (caseId: string) =>
  useClinicalMutation((payload: ExportChargesPayload) => exportCharges(caseId, payload));

export function usePathology(caseId: string) {
  return useQuery({ queryKey: queryKeys.cases.pathology(caseId), queryFn: () => getPathology(caseId) });
}

export const useRecordPathologyResult = (caseId: string) =>
  useClinicalMutation((payload: RecordPathologyPayload) => recordPathologyResult(caseId, payload));
export const useReconcilePathology = (caseId: string) =>
  useClinicalMutation((payload: ReconcilePathologyPayload) => reconcilePathology(caseId, payload));
export const useSetSurveillance = (caseId: string) =>
  useClinicalMutation((payload: SetSurveillancePayload) => setSurveillance(caseId, payload));
export const useSendResultLetter = (caseId: string) =>
  useClinicalMutation((payload: SendResultLetterPayload) => sendResultLetter(caseId, payload));

// ─── Center-wide ────────────────────────────────────────────────────────────

export function useWorklist(query: WorklistQuery = {}) {
  return useQuery({ queryKey: queryKeys.worklist.list(query), queryFn: () => getWorklist(query), placeholderData: keepPreviousData });
}

export const useCompleteWorkItem = () => useClinicalMutation(completeWorkItem);

export function useWhiteboard() {
  return useQuery({ queryKey: queryKeys.whiteboard, queryFn: getWhiteboard, refetchInterval: LIVE_REFETCH_MS });
}

export function useQualityMetrics() {
  return useQuery({ queryKey: queryKeys.quality, queryFn: getQualityMetrics });
}

export function useAuditLog(query: AuditQuery = {}) {
  return useQuery({ queryKey: queryKeys.audit.list(query), queryFn: () => getAuditLog(query), placeholderData: keepPreviousData });
}

export function useAdminOverview() {
  return useQuery({ queryKey: queryKeys.admin, queryFn: getAdminOverview });
}

export function useDashboardSummary() {
  return useQuery({ queryKey: queryKeys.dashboard, queryFn: getDashboardSummary, refetchInterval: LIVE_REFETCH_MS });
}

/** Command-palette search; idle until the query has 2+ characters. */
export function useSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: queryKeys.search(term),
    queryFn: () => searchAll(term),
    enabled: term.length >= SEARCH_MIN_LENGTH,
    placeholderData: keepPreviousData,
  });
}

export function usePathologyQueue() {
  return useQuery({ queryKey: queryKeys.pathologyQueue, queryFn: getPathologyQueue });
}

export function useCodingQueue() {
  return useQuery({ queryKey: queryKeys.codingQueue, queryFn: getCodingQueue });
}

// ─── Portal & demo ──────────────────────────────────────────────────────────

export function useMyCare() {
  return useQuery({ queryKey: queryKeys.myCare, queryFn: getMyCare });
}

export const useUpdatePrepItem = () => useClinicalMutation(updatePrepItem);
export const useUpdateMyEscort = () => useClinicalMutation(updateMyEscort);
export const useResetDemo = () => useClinicalMutation(resetDemo);
