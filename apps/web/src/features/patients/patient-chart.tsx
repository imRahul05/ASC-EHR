"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@asc/api-client";
import { usePatient } from "@asc/api-client/react";
import type { Patient } from "@asc/types";
import {
  Button,
  EligibilityChip,
  ErrorState,
  LoadingSkeleton,
  OfflineBanner,
  PatientBanner,
  StaleBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@asc/ui";
import { ArrowLeft, CalendarPlus, ClipboardList, FolderOpen, LayoutGrid, Pill, type LucideIcon } from "@asc/ui/icons";
import { ChartCases } from "./chart-cases";
import { ChartDocuments } from "./chart-documents";
import { ChartMeds } from "./chart-meds";
import { ChartSummary } from "./chart-summary";
import { patientRefOf } from "./patient-ref";

interface PatientChartProps {
  readonly patientId: string;
}

const CHART_TABS: readonly {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly Component: (props: { readonly patient: Patient }) => React.ReactNode;
}[] = [
  { id: "summary", label: "Summary", icon: LayoutGrid, Component: ChartSummary },
  { id: "cases", label: "Cases", icon: ClipboardList, Component: ChartCases },
  { id: "meds", label: "Meds & allergies", icon: Pill, Component: ChartMeds },
  { id: "documents", label: "Documents & timeline", icon: FolderOpen, Component: ChartDocuments },
];

const DEFAULT_TAB = "summary";

/** `/patients/[patientId]?tab=` — banner + tabbed chart. */
function PatientChartView({ patientId }: PatientChartProps) {
  const query = usePatient(patientId);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = params.get("tab");
  const tab = CHART_TABS.some((item) => item.id === requested) ? (requested ?? DEFAULT_TAB) : DEFAULT_TAB;

  const setTab = (next: string) => router.replace(`${pathname}?tab=${next}`, { scroll: false });

  if (query.isPending) return <LoadingSkeleton variant="detail" />;
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <ErrorState
        title={notFound ? "Patient not found" : "Could not load the chart"}
        message={notFound ? "The chart may have been removed or the demo data was reset." : "Check your connection and try again."}
        onRetry={notFound ? undefined : () => void query.refetch()}
      />
    );
  }

  const patient = query.data;
  return (
    <div className="space-y-4" data-testid="patient-chart">
      <div className="flex items-center justify-between gap-2">
        <Link href="/patients" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft aria-hidden className="size-3" /> Patients
        </Link>
        <StaleBadge refreshing={query.isFetching} stale={query.isRefetchError} />
      </div>
      <OfflineBanner />
      <PatientBanner
        patient={patientRefOf(patient)}
        allergies={patient.allergies}
        escort={patient.escort}
        meta={[patient.coverage?.payer ?? "Self-pay", <EligibilityChip key="elig" status={patient.coverage?.eligibility?.status} />]}
        actions={
          <Button render={<Link href={`/schedule?book=1&patient=${patient.id}`} />} nativeButton={false} size="sm" data-testid="chart-book-case">
            <CalendarPlus aria-hidden /> Book case
          </Button>
        }
      />
      <Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="min-w-0 gap-4">
        <TabsList variant="line" className="h-auto! w-full flex-wrap justify-start border-b border-border pb-px" aria-label="Chart sections">
          {CHART_TABS.map(({ id, label, icon: Icon }) => (
            <TabsTrigger key={id} value={id} className="flex-none px-2.5" data-testid={`chart-tab-${id}`}>
              <Icon aria-hidden />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        {CHART_TABS.map(({ id, Component }) => (
          <TabsContent key={id} value={id} className="min-w-0">
            <Component patient={patient} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export function PatientChart({ patientId }: PatientChartProps) {
  return (
    <Suspense fallback={<LoadingSkeleton variant="detail" />}>
      <PatientChartView patientId={patientId} />
    </Suspense>
  );
}
