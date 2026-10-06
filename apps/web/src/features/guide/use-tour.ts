"use client";

import { useEffect } from "react";
import { useCaseDetails } from "@asc/api-client/react";
import { useCan } from "@/hooks/use-can";
import { PERSONAS } from "@/lib/personas";
import { TOUR_PHASE_HINT, TOUR_STEPS } from "./guide-content";
import { markStepsDone, useGuideState } from "./guide-store";

const CASE_STEPS = TOUR_STEPS.flatMap((step) => ("caseId" in step ? [step] : []));
const CASE_IDS = CASE_STEPS.map((step) => step.caseId);

/**
 * Tour progress = steps ticked by hand (persisted ids) ∪ steps whose seeded case already reached the target
 * (observed through the same case queries the workspace uses; auto ticks are persisted too).
 */
export function useTour() {
  const guide = useGuideState();
  const can = useCan();
  const watching = guide.tour === "active" && can("case.read");
  const cases = useCaseDetails(CASE_IDS, { enabled: watching });

  const autoDone: readonly string[] = CASE_STEPS.filter((step, index) => {
    const detail = cases[index]?.data;
    return detail ? step.check(detail) : false;
  }).map((step) => step.id);
  const unsaved = autoDone.filter((id) => !guide.done.includes(id)).join(",");

  // Persist newly observed completions so they survive a data reset / reload.
  useEffect(() => {
    if (unsaved) markStepsDone(unsaved.split(","));
  }, [unsaved]);

  const steps = TOUR_STEPS.map((step) => ({
    id: step.id,
    title: step.title,
    description: step.description,
    badge: PERSONAS[step.persona].short,
    done: guide.done.includes(step.id) || autoDone.includes(step.id),
    autoHint: "caseId" in step ? ("autoHint" in step ? step.autoHint : TOUR_PHASE_HINT) : undefined,
  }));

  return { steps, status: guide.tour, collapsed: guide.collapsed, doneCount: steps.filter((step) => step.done).length };
}
