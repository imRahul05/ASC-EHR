"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@asc/api-client/react";
import type { CaseDetail, UserRole } from "@asc/types";
import { Button, HelpSheet } from "@asc/ui";
import { LifeBuoy, Map as MapIcon, Sparkles } from "@asc/ui/icons";
import { NAV_BY_ROLE, ROLE_LABEL } from "@/components/shell/nav-config";
import { DEFAULT_TAB_BY_PHASE, isCaseTab } from "@/features/case/case-tabs";
import { CASE_TAB_HELP, ROUTE_HELP } from "./guide-content";
import { closeHelp, setTourCollapsed, showWelcome, startTour, updateGuide, useGuideState } from "./guide-store";

const ROLES = Object.keys(ROLE_LABEL) as UserRole[];

/** The sheet never resets progress; restarting lives in the Help center. */
const TOUR_BUTTON = {
  idle: { label: "Start tour", run: () => startTour() },
  dismissed: { label: "Resume tour", run: () => startTour() },
  active: {
    label: "Show tour",
    run: () => {
      setTourCollapsed(false);
      closeHelp();
    },
  },
} as const;

const recordTestId = (href: string) => href.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");

const rolesFor = (key: string, explicit?: readonly UserRole[]) =>
  (explicit ?? ROLES.filter((role) => NAV_BY_ROLE[role].some((item) => item.key === key))).map((role) => ROLE_LABEL[role].label);

/** Help for the current route (and, in the case workspace, the open tab). Opened by the top-bar ? button or the `?` key. */
export function PageHelpSheet() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const guide = useGuideState();

  const [, segment = "", caseId] = pathname.split("/");
  const isCase = segment === "cases" && caseId !== undefined;
  // The workspace has already loaded the case; read the cache to find its default tab (no extra fetch).
  const detail = isCase ? queryClient.getQueryData<CaseDetail>(queryKeys.cases.detail(caseId)) : undefined;
  const requestedTab = searchParams.get("tab");
  const tab = isCaseTab(requestedTab) ? requestedTab : DEFAULT_TAB_BY_PHASE[detail?.case.phase ?? "SCHEDULED"];

  const entry = isCase ? CASE_TAB_HELP[tab] : ROUTE_HELP[segment];
  const help = entry ?? ROUTE_HELP.guide;
  if (!help) return null;

  const open = (href: string) => {
    closeHelp();
    router.push(href);
  };
  const tour = TOUR_BUTTON[guide.tour];

  return (
    <HelpSheet
      open={guide.helpOpen}
      onOpenChange={(next) => updateGuide({ helpOpen: next })}
      eyebrow={isCase ? "Help · case workspace tab" : "Help · this page"}
      title={help.title}
      purpose={help.purpose}
      steps={help.steps}
      records={(help.records ?? []).map((record) => ({ id: recordTestId(record.href), label: record.label, hint: record.hint, onSelect: () => open(record.href) }))}
      roles={rolesFor(segment, help.roles)}
      mocked={help.mocked}
      production={help.production}
      footer={
        <>
          <Button size="sm" variant="outline" render={<Link href="/guide" onClick={closeHelp} />} nativeButton={false} data-testid="help-open-guide">
            <LifeBuoy /> Help center
          </Button>
          <Button size="sm" variant="outline" onClick={tour.run} data-testid="help-tour">
            <MapIcon /> {tour.label}
          </Button>
          <Button size="sm" variant="ghost" onClick={showWelcome} data-testid="help-welcome">
            <Sparkles /> Welcome
          </Button>
        </>
      }
    />
  );
}
