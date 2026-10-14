import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingSkeleton } from "@asc/ui/components/clinical/loading-skeleton";
import { WhiteboardBoard } from "@/features/whiteboard/whiteboard-board";

export const metadata: Metadata = { title: "Whiteboard" };

interface WhiteboardPageProps {
  readonly searchParams?: Promise<{ mode?: string }> | { mode?: string };
}

export default async function WhiteboardPage({ searchParams }: WhiteboardPageProps) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  const isTv = resolvedParams?.mode === "tv" || resolvedParams?.mode === "kiosk";

  return (
    <Suspense fallback={<LoadingSkeleton variant="cards" />}>
      <WhiteboardBoard initialTv={isTv} />
    </Suspense>
  );
}

