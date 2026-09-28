import type { Metadata } from "next";
import { WorklistView } from "@/features/worklist/worklist-view";

export const metadata: Metadata = { title: "Worklist" };

export default function WorklistPage() {
  return <WorklistView />;
}
