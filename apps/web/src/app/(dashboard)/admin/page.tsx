import type { Metadata } from "next";
import { RequireCapability } from "@/components/auth/require-capability";
import { AdminConsole } from "@/features/admin/admin-console";
import { ROUTE_ACCESS } from "@/lib/route-access";

export const metadata: Metadata = { title: "Admin" };

export default function AdminPage() {
  return (
    <RequireCapability capability={ROUTE_ACCESS.admin}>
      <AdminConsole />
    </RequireCapability>
  );
}
