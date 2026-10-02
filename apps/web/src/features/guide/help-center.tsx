"use client";

import { useResetDemo } from "@asc/api-client/react";
import { Button, PageHeader, toast } from "@asc/ui";
import { Map as MapIcon, RotateCcw } from "@asc/ui/icons";
import { DEMO_EXPLAINER } from "./demo-explainer-data";
import { GuideJourney } from "./guide-journey";
import { GuidePersonas } from "./guide-personas";
import { GuideReference } from "./guide-reference";
import { startTour, useGuideState } from "./guide-store";

const TOUR_ACTION = {
  idle: { label: "Start guided tour", restart: false },
  active: { label: "Restart tour", restart: true },
  dismissed: { label: "Resume tour", restart: false },
} as const;

/** `/guide` — everything a first-time user needs, without anyone explaining. */
export function HelpCenter() {
  const { tour } = useGuideState();
  const resetDemo = useResetDemo();
  const action = TOUR_ACTION[tour];

  const onReset = () =>
    resetDemo.mutate(undefined, {
      onSuccess: () => toast.success("Demo data reset", { description: "Every record is back to its starting point." }),
      onError: () => toast.error("Could not reset demo data"),
    });

  return (
    <div className="space-y-6" data-testid="help-center">
      <PageHeader
        eyebrow="Help center"
        title="How to use this demo"
        description="A mock GI surgery center EHR with synthetic data. Follow the tour, or jump to any feature below."
        actions={
          <>
            <Button variant="outline" onClick={onReset} disabled={resetDemo.isPending} data-testid="guide-reset-demo">
              <RotateCcw /> Reset demo data
            </Button>
            <Button onClick={() => startTour(action.restart)} data-testid="guide-tour">
              <MapIcon /> {action.label}
            </Button>
          </>
        }
      />

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="How the demo works">
        {DEMO_EXPLAINER.map((item, index) => (
          <li key={item.id} className="rounded-xl border border-border bg-card p-4 shadow-xs">
            <p className="text-xs font-medium text-primary tabular-nums">Step {index + 1}</p>
            <p className="mt-1 text-sm font-medium">{item.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
          </li>
        ))}
      </ol>

      <section className="space-y-3" aria-labelledby="guide-features-title">
        <h2 id="guide-features-title" className="text-sm font-semibold tracking-tight">
          Features by journey stage
        </h2>
        <GuideJourney />
      </section>

      <GuidePersonas />
      <GuideReference />
    </div>
  );
}
