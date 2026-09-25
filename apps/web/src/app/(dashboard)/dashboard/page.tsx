"use client";

import { useDashboardData } from "../../../hooks/use-dashboard-data";
import { SurgeonView } from "../../../components/dashboard/views/surgeon-view";
import { AnesthesiaView } from "../../../components/dashboard/views/anesthesia-view";
import { NurseView } from "../../../components/dashboard/views/nurse-view";
import { AdminView } from "../../../components/dashboard/views/admin-view";
import { PatientView } from "../../../components/dashboard/views/patient-view";
import { Skeleton } from "@asc/ui";

export default function DashboardPage() {
  const { activeRole, isLoading } = useDashboardData();

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {activeRole === "SURGEON" && <SurgeonView />}
      {activeRole === "ANESTHESIOLOGIST" && <AnesthesiaView />}
      {activeRole === "NURSE" && <NurseView />}
      {activeRole === "ADMIN" && <AdminView />}
      {activeRole === "PATIENT" && <PatientView />}
    </div>
  );
}
