import type { Metadata } from "next";
import { ScheduleBoard } from "@/features/schedule/schedule-board";

export const metadata: Metadata = { title: "Schedule" };

export default function SchedulePage() {
  return <ScheduleBoard />;
}
