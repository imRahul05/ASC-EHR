import type { Metadata } from "next";
import { CaseWorkspace } from "@/features/case/case-workspace";

// Title never contains PHI — ids only in the URL.
export const metadata: Metadata = { title: "Case" };

interface CasesCaseIdPageProps {
  readonly params: Promise<{ caseId: string }>;
}

export default async function CasesCaseIdPage({ params }: CasesCaseIdPageProps) {
  const { caseId } = await params;
  return <CaseWorkspace caseId={caseId} />;
}
