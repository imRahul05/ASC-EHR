import type { Metadata } from "next";
import { HelpCenter } from "@/features/guide/help-center";

export const metadata: Metadata = { title: "Help center" };

export default function GuidePage() {
  return <HelpCenter />;
}
