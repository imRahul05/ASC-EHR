import type { Metadata } from "next";
import { RoleDashboard } from "@/features/dashboard/role-dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return <RoleDashboard />;
}
