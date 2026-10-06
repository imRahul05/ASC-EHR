import type { Metadata } from "next";
import { RequireCapability } from "@/components/auth/require-capability";
import { AuditLog } from "@/features/audit/audit-log";
import { ROUTE_ACCESS } from "@/lib/route-access";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditPage() {
  return (
    <RequireCapability capability={ROUTE_ACCESS.audit}>
      <AuditLog />
    </RequireCapability>
  );
}
