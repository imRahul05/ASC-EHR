import type { Metadata } from "next";
import { WhiteboardBoard } from "@/features/whiteboard/whiteboard-board";

export const metadata: Metadata = { title: "Whiteboard" };

export default function WhiteboardPage() {
  return <WhiteboardBoard />;
}
