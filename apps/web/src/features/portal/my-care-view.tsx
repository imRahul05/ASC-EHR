"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@asc/api-client";
import { useMyCare } from "@asc/api-client/react";
import type { MyCare } from "@asc/types";
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader, SectionCard, cn } from "@asc/ui";
import { CalendarX, ChevronRight, ClipboardList, FileHeart, HeartHandshake, UsersRound, type LucideIcon } from "@asc/ui/icons";
import { useAuth } from "@/hooks/use-auth";
import { EscortForm } from "./escort-form";
import { PrepChecklist } from "./prep-checklist";
import { ProcedureCard } from "./procedure-card";
import { ResultsView } from "./results-view";

type View = "overview" | "prep" | "escort" | "results";

/** Sections of the portal (`?view=`), each rendered from the same MyCare payload. */
const VIEWS: Readonly<Record<View, { readonly label: string; readonly icon: LucideIcon; readonly href: string; readonly render: (care: MyCare, facility: string) => React.ReactNode }>> = {
  overview: { label: "Overview", icon: HeartHandshake, href: "/my-care", render: (care, facility) => <Overview care={care} facility={facility} /> },
  prep: {
    label: "Prep",
    icon: ClipboardList,
    href: "/my-care?view=prep",
    render: (care) => (care.case ? <PrepChecklist items={care.prep} procedureStart={care.case.scheduledStart} /> : <NoProcedure />),
  },
  escort: { label: "Escort", icon: UsersRound, href: "/my-care?view=escort", render: (care) => <EscortForm escort={care.patient.escort} /> },
  results: { label: "Results & instructions", icon: FileHeart, href: "/my-care?view=results", render: (care) => <ResultsView care={care} /> },
};
const VIEW_ORDER: readonly View[] = ["overview", "prep", "escort", "results"];
const isView = (value: string | null): value is View => VIEW_ORDER.some((view) => view === value);

/** `/my-care` — patient portal: procedure + countdown, prep checklist, escort, instructions and results. */
export function MyCareView() {
  return (
    <Suspense fallback={<LoadingSkeleton variant="page" />}>
      <MyCareContent />
    </Suspense>
  );
}

function MyCareContent() {
  const requested = useSearchParams().get("view");
  const view: View = isView(requested) ? requested : "overview";
  const care = useMyCare();
  const facility = useAuth().user?.facilityName ?? "the surgery center";

  if (care.isPending) return <LoadingSkeleton variant="detail" />;
  if (care.isError) {
    const forbidden = care.error instanceof ApiError && care.error.status === 403;
    return (
      <ErrorState
        title={forbidden ? "This page is for patients" : "We couldn't load your care plan"}
        message={forbidden ? "Sign in with a patient account to see My procedure." : "Please try again in a moment."}
        onRetry={forbidden ? undefined : () => void care.refetch()}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6" data-testid="my-care" data-view={view}>
      <PageHeader eyebrow="My care" title={`Hi ${care.data.patient.firstName}`} description="Everything you need before and after your procedure, in one place." />
      <nav aria-label="My care sections" className="flex flex-wrap gap-2">
        {VIEW_ORDER.map((id) => {
          const { label, icon: Icon, href } = VIEWS[id];
          return (
            <Link
              key={id}
              href={href}
              aria-current={id === view ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                id === view ? "border-primary/40 bg-accent font-medium text-accent-foreground" : "border-border text-muted-foreground hover:bg-muted",
              )}
              data-testid={`portal-nav-${id}`}
            >
              <Icon className="size-4" aria-hidden /> {label}
            </Link>
          );
        })}
      </nav>
      {VIEWS[view].render(care.data, facility)}
    </div>
  );
}

function NoProcedure() {
  return <EmptyState icon={CalendarX} title="No upcoming procedure" description="When your procedure is booked, your prep steps will appear here." />;
}

/** Landing view: procedure card + a calm "what to do next" list. */
function Overview({ care, facility }: { readonly care: MyCare; readonly facility: string }) {
  const prepDone = care.prep.filter((item) => item.done).length;
  const next = [
    { view: "prep" as const, title: "Bowel prep", status: care.prep.length ? `${prepDone} of ${care.prep.length} steps done` : "Steps appear once booked", done: care.prep.length > 0 && prepDone === care.prep.length },
    { view: "escort" as const, title: "Your escort", status: care.patient.escort?.confirmed ? `${care.patient.escort.name} is confirmed` : "Please add who will drive you home", done: care.patient.escort?.confirmed ?? false },
    {
      view: "results" as const,
      title: "Results & instructions",
      status: care.letters.length ? "Your results are ready" : care.instructions ? "Your care instructions are ready" : "Available after your procedure",
      done: care.letters.length > 0,
    },
  ];

  return (
    <div className="space-y-4">
      {care.case ? <ProcedureCard procedureCase={care.case} facilityName={facility} /> : <NoProcedure />}
      <SectionCard title="Your checklist" contentClassName="p-2" data-testid="portal-overview-next">
        <ul className="divide-y divide-border/60">
          {next.map((item) => {
            const Icon = VIEWS[item.view].icon;
            return (
              <li key={item.view}>
                <Link href={VIEWS[item.view].href} className="flex items-center gap-3 rounded-lg p-3 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/40">
                  <span className={cn("flex size-9 items-center justify-center rounded-full", item.done ? "bg-success/12 text-success" : "bg-muted text-muted-foreground")}>
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{item.title}</span>
                    <span className="block text-sm text-muted-foreground">{item.status}</span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </SectionCard>
    </div>
  );
}
