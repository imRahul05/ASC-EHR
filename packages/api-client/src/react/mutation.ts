import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  CaseDetail,
  CopayCollectionResult,
  EligibilityCheckResult,
  PriorAuthResult,
  SignConsentPayload,
  SignConsentResult,
} from "@asc/types";
import type { AnticoagulationAssessmentInput } from "@asc/validation/anticoagulation";
import type { SignConsentInput } from "@asc/validation/consent";
import type {
  CopayCollection,
  EligibilityCheckRequest,
  PriorAuthCheck,
} from "@asc/validation/financial";
import type { HpOverrideInput, HpUpdateNoteInput } from "@asc/validation/hp";
import type { PreopAssessmentInput } from "@asc/validation/preop";
import {
  signConsent,
  submitAnticoagulation,
  submitHpOverride,
  submitHpUpdate,
  submitPreopAssessment,
} from "../clinical/cases";
import {
  checkEligibility,
  collectCopay,
  recordPriorAuth,
} from "../clinical/financial";
import { getFacilityId } from "../http";
import { queryKeys } from "./query-keys";

/**
 * Refreshes every clinical query after a command. One command can change many screens
 * (case, schedule, whiteboard, worklist, audit, dashboards); only mounted queries refetch,
 * the rest are marked stale. Auth queries are left alone.
 */
export function invalidateClinical(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== queryKeys.auth.all[0] });
}

/** Mutation that invalidates all clinical queries on success (and waits for it). */
export function useClinicalMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  onData?: (queryClient: QueryClient, data: TData) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      onData?.(queryClient, data);
      return invalidateClinical(queryClient);
    },
  });
}

export function useCaseCommand<TPayload>(
  caseId: string,
  command: (caseId: string, payload: TPayload) => Promise<CaseDetail>,
  facilityId?: string,
) {
  const resolvedFacility = facilityId?.trim() || getFacilityId()?.trim() || undefined;
  return useClinicalMutation(
    (payload: TPayload) => command(caseId, payload),
    (queryClient, detail) => {
      queryClient.setQueryData(queryKeys.cases.detail(caseId, resolvedFacility), detail);
      if (resolvedFacility) {
        queryClient.setQueryData(queryKeys.cases.detail(caseId), detail);
      }
    },
  );
}

export function useSignConsent(caseId: string, facilityId?: string | null) {
  const resolvedFacility = facilityId?.trim() || getFacilityId()?.trim() || undefined;
  return useClinicalMutation<SignConsentInput | SignConsentPayload, SignConsentResult | CaseDetail>(
    (payload: SignConsentInput | SignConsentPayload) => {
      if ("consentFormVersion" in payload) {
        return signConsent(caseId, payload, resolvedFacility);
      }
      return signConsent(caseId, payload, resolvedFacility);
    },
    (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.detail(caseId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.consent(caseId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all });
    },
  );
}

export function useSubmitPreopAssessment(caseId: string, facilityId?: string | null) {
  const resolvedFacility = facilityId?.trim() || getFacilityId()?.trim() || undefined;
  return useClinicalMutation(
    (payload: PreopAssessmentInput) => submitPreopAssessment(caseId, payload, resolvedFacility),
    (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.detail(caseId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all });
    },
  );
}

export function useSubmitHpUpdateMutation(caseId: string, facilityId?: string | null) {
  const resolvedFacility = facilityId?.trim() || getFacilityId()?.trim() || undefined;
  return useClinicalMutation(
    (payload: HpUpdateNoteInput) => submitHpUpdate(caseId, payload, resolvedFacility),
    (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.detail(caseId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.hp(caseId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all });
    },
  );
}
export const useSubmitHpUpdate = useSubmitHpUpdateMutation;

export function useSubmitHpOverrideMutation(caseId: string, facilityId?: string | null) {
  const resolvedFacility = facilityId?.trim() || getFacilityId()?.trim() || undefined;
  return useClinicalMutation(
    (payload: HpOverrideInput) => submitHpOverride(caseId, payload, resolvedFacility),
    (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.detail(caseId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.hp(caseId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all });
    },
  );
}
export const useSubmitHpOverride = useSubmitHpOverrideMutation;

export function useSubmitAnticoagulationMutation(caseId: string, facilityId?: string | null) {
  const resolvedFacility = facilityId?.trim() || getFacilityId()?.trim() || undefined;
  return useClinicalMutation(
    (payload: AnticoagulationAssessmentInput) => submitAnticoagulation(caseId, payload, resolvedFacility),
    (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.detail(caseId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all });
    },
  );
}
export const useSubmitAnticoagulation = useSubmitAnticoagulationMutation;

export function useCaseEligibilityCheckMutation(caseId: string, facilityId?: string | null) {
  const resolvedFacility = facilityId?.trim() || getFacilityId()?.trim() || undefined;
  return useClinicalMutation<EligibilityCheckRequest | undefined, EligibilityCheckResult>(
    (payload) => checkEligibility(caseId, payload, resolvedFacility),
    (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.financial(caseId, resolvedFacility) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.detail(caseId, resolvedFacility) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all });
    },
  );
}
export const useCaseEligibilityCheck = useCaseEligibilityCheckMutation;
export const useCheckCaseEligibility = useCaseEligibilityCheckMutation;

export function useCollectCopayMutation(caseId: string, facilityId?: string | null) {
  const resolvedFacility = facilityId?.trim() || getFacilityId()?.trim() || undefined;
  return useClinicalMutation<CopayCollection, CopayCollectionResult>(
    (payload) => collectCopay(caseId, payload, resolvedFacility),
    (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.financial(caseId, resolvedFacility) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.detail(caseId, resolvedFacility) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all });
    },
  );
}
export const useCollectCopay = useCollectCopayMutation;

export function useRecordPriorAuthMutation(caseId: string, facilityId?: string | null) {
  const resolvedFacility = facilityId?.trim() || getFacilityId()?.trim() || undefined;
  return useClinicalMutation<PriorAuthCheck, PriorAuthResult>(
    (payload) => recordPriorAuth(caseId, payload, resolvedFacility),
    (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.financial(caseId, resolvedFacility) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.detail(caseId, resolvedFacility) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all });
    },
  );
}
export const useRecordPriorAuth = useRecordPriorAuthMutation;


