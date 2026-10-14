import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingSkeleton } from "@asc/ui/components/clinical/loading-skeleton";
import { WhiteboardBoard } from "@/features/whiteboard/whiteboard-board";

export const metadata: Metadata = { title: "Whiteboard Kiosk" };

export default function BoardPage() {
  return (
    <Suspense fallback={<LoadingSkeleton variant="cards" />}>
      <WhiteboardBoard initialTv={true} />
    </Suspense>
  );
}
