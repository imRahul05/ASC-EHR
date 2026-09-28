import type { Metadata } from "next";
import { QualityDashboard } from "@/features/quality/quality-dashboard";

export const metadata: Metadata = { title: "Quality" };

export default function QualityPage() {
  return <QualityDashboard />;
}
