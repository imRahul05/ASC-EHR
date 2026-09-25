"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GICase, UserRole } from "@asc/types";
import { getDashboardData, updateCaseStatus } from "../lib/api/dashboard.api";
import { useAuthStore } from "../lib/stores/auth.store";

export function useDashboardData() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const activeRole: UserRole = user?.role ?? "SURGEON";

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["dashboard", activeRole],
    queryFn: () => getDashboardData(activeRole),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ caseId, status }: { caseId: string; status: GICase["status"] }) =>
      updateCaseStatus(caseId, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  return {
    dashboardData: data,
    metrics: data?.metrics,
    cases: data?.cases ?? [],
    auditLogs: data?.auditLogs ?? [],
    activeRole,
    isLoading,
    isError,
    error,
    refetch,
    updateCaseStatus: updateStatusMutation.mutateAsync,
    isUpdatingStatus: updateStatusMutation.isPending,
  };
}
