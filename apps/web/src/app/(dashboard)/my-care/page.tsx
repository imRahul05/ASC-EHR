import type { Metadata } from "next";
import { MyCareView } from "@/features/portal/my-care-view";

export const metadata: Metadata = { title: "My procedure" };

export default function MyCarePage() {
  return <MyCareView />;
}
