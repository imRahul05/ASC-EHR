import type { Metadata } from "next";
import { CodingQueue } from "@/features/coding/coding-queue";

export const metadata: Metadata = { title: "Coding" };

export default function CodingPage() {
  return <CodingQueue />;
}
