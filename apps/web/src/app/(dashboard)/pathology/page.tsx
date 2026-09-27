import type { Metadata } from "next";
import { PathologyQueue } from "@/features/pathology/pathology-queue";

export const metadata: Metadata = { title: "Pathology" };

export default function PathologyPage() {
  return <PathologyQueue />;
}
