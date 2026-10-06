import type { Metadata } from "next";
import { RequireCapability } from "@/components/auth/require-capability";
import { QualityDashboard } from "@/features/quality/quality-dashboard";
import { ROUTE_ACCESS } from "@/lib/route-access";

export const metadata: Metadata = { title: "Quality" };

export default function QualityPage() {
  return (
    <RequireCapability capability={ROUTE_ACCESS.quality}>
      <QualityDashboard />
    </RequireCapability>
  );
}
