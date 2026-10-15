import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { CaseDetail } from "@asc/types";
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
