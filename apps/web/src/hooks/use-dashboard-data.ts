"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDashboardData, updateCaseStatus } from "@asc/api-client";
import type { CaseStatus, UserRole } from "@asc/types";
import { useAuthStore } from "../lib/stores/auth.store";

const DASHBOARD_STALE_MS = 2 * 60 * 1000;

export function useDashboardData() {
  const queryClient = useQueryClient();
  const activeRole: UserRole = useAuthStore((state) => state.session?.user.role) ?? "SURGEON";

  const query = useQuery({
    queryKey: ["dashboard", activeRole],
    queryFn: () => getDashboardData(activeRole),
    staleTime: DASHBOARD_STALE_MS,
  });

  const updateStatus = useMutation({
    mutationFn: ({ caseId, status }: { caseId: string; status: CaseStatus }) => updateCaseStatus(caseId, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  return {
    dashboardData: query.data,
    metrics: query.data?.metrics,
    cases: query.data?.cases ?? [],
    auditLogs: query.data?.auditLogs ?? [],
    activeRole,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    updateCaseStatus: updateStatus.mutateAsync,
    isUpdatingStatus: updateStatus.isPending,
  };
}
