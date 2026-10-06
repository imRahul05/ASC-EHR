import type { Metadata } from "next";
import { RequireCapability } from "@/components/auth/require-capability";
import { CodingQueue } from "@/features/coding/coding-queue";
import { ROUTE_ACCESS } from "@/lib/route-access";

export const metadata: Metadata = { title: "Coding" };

export default function CodingPage() {
  return (
    <RequireCapability capability={ROUTE_ACCESS.coding}>
      <CodingQueue />
    </RequireCapability>
  );
}
