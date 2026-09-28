"use client";

import Link from "next/link";
import { Suspense } from "react";
import { toast, TourChecklist, WelcomeDialog } from "@asc/ui";
import { TOUR_STEPS, WELCOME } from "./guide-content";
import { dismissTour, setStepDone, setTourCollapsed, skipWelcome, startTour, useGuideState } from "./guide-store";
import { PageHelpSheet } from "./page-help-sheet";
import { useGoTo } from "./use-go-to";
import { useTour } from "./use-tour";

const NARROW_QUERY = "(max-width: 639px)";

function TourPanel() {
  const { steps, collapsed } = useTour();
  const { goTo, pendingKey } = useGoTo();

  const onGo = (stepId: string) => {
    const step = TOUR_STEPS.find((item) => item.id === stepId);
    if (!step) return;
    // On a phone the open panel would cover the screen we just navigated to.
    if (window.matchMedia(NARROW_QUERY).matches) setTourCollapsed(true);
    void goTo(step.role, step.href, step.id);
  };
  const onDismiss = () => {
    dismissTour();
    toast("Tour hidden", { description: "Resume it any time from Help (?) or the Help center." });
  };

  return (
    <TourChecklist
      steps={steps}
      collapsed={collapsed}
      onCollapsedChange={setTourCollapsed}
      onGo={onGo}
      onToggleDone={setStepDone}
      onDismiss={onDismiss}
      pendingStepId={pendingKey}
      completeMessage={
        <>
          <span className="font-medium text-foreground">You walked the whole journey.</span> As Front desk, open{" "}
          <Link href="/quality" className="font-medium text-primary underline-offset-2 hover:underline">
            Quality
          </Link>{" "}
          and the{" "}
          <Link href="/audit" className="font-medium text-primary underline-offset-2 hover:underline">
            Audit log
          </Link>{" "}
          to see it all recorded.
        </>
      }
    />
  );
}

/** Signed-in onboarding layer: first-run welcome, guided tour panel, page help sheet. Mounted once in the shell. */
export function GuideLayer() {
  const guide = useGuideState();
  const welcomeOpen = !guide.welcomeSeen || guide.welcomeOpen;

  return (
    <>
      <WelcomeDialog
        open={welcomeOpen}
        onOpenChange={(open) => (open ? undefined : skipWelcome())}
        title={WELCOME.title}
        intro={WELCOME.intro}
        highlights={WELCOME.highlights}
        note={WELCOME.note}
        primaryLabel={guide.tour === "idle" ? "Start guided tour" : "Resume guided tour"}
        onPrimary={() => startTour()}
        secondaryLabel="Explore on my own"
        onSecondary={skipWelcome}
      />
      {guide.tour === "active" && !welcomeOpen && <TourPanel />}
      <Suspense fallback={null}>
        <PageHelpSheet />
      </Suspense>
    </>
  );
}
