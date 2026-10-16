"use client";

import { useState } from "react";
import { ApiError } from "@asc/api-client";
import { useCase } from "@asc/api-client/react";
import { formatTime24, formatWeekday } from "@asc/clinical-rules/time";
import { ErrorState } from "@asc/ui/components/clinical/error-state";
import { LoadingSkeleton } from "@asc/ui/components/clinical/loading-skeleton";
import { PatientBanner } from "@asc/ui/components/clinical/patient-banner";
import { PhaseStepper } from "@asc/ui/components/clinical/phase-stepper";
import { SectionCard } from "@asc/ui/components/clinical/section-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@asc/ui/components/ui/tabs";
import dynamic from "next/dynamic";
import { TabHint } from "../guide/tab-hint";
import { CASE_TABS } from "./case-tabs";
import { GatePanel } from "./gate-panel";
import { PhaseHistory } from "./phase-history";
import { useCaseTab } from "./use-case-tab";

const ConsentModal = dynamic(
  () => import("./components/consent-modal").then((m) => m.ConsentModal),
  { ssr: false },
);
const HpOverrideModal = dynamic(
  () => import("./components/hp-override-modal").then((m) => m.HpOverrideModal),
  { ssr: false },
);
const HpUpdateModal = dynamic(
  () => import("./components/hp-update-modal").then((m) => m.HpUpdateModal),
  { ssr: false },
);
const PreopIntakeDrawer = dynamic(
  () => import("./components/preop-intake-drawer").then((m) => m.PreopIntakeDrawer),
  { ssr: false },
);

interface CaseWorkspaceProps {
  readonly caseId: string;
}

const INTENT_LABEL = { screening: "Screening", surveillance: "Surveillance", diagnostic: "Diagnostic", therapeutic: "Therapeutic" } as const;

type ActiveModal = "consent" | "preop" | "hpUpdate" | "hpOverride" | null;

/**
 * Case workspace shell: patient banner, phase stepper, gate panel with the "advance phase" action,
 * and the workflow tabs (state in `?tab=`). Tabs own their content (features/case/tabs/*).
 */
export function CaseWorkspace({ caseId }: CaseWorkspaceProps) {
  const query = useCase(caseId);
  const { tab, setTab } = useCaseTab(query.data?.case.phase);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  if (query.isPending) return <LoadingSkeleton variant="detail" />;
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <ErrorState
        title={notFound ? "Case not found" : "Could not load the case"}
        message={notFound ? "It may have been removed or the demo data was reset." : "Check your connection and try again."}
        onRetry={notFound ? undefined : () => void query.refetch()}
      />
    );
  }

  const detail = query.data;
  const procedureCase = detail.case;
  const room = procedureCase.roomId.replace("room-", "Room ");

  return (
    <div className="space-y-4" data-testid="case-workspace">
      <PatientBanner
        patient={procedureCase.patient}
        allergies={detail.patient.allergies}
        phase={procedureCase.phase}
        escort={detail.patient.escort}
        meta={[
          <span key="case" className="font-mono">
            {procedureCase.caseNumber}
          </span>,
          `${procedureCase.procedureLabel} · ${INTENT_LABEL[procedureCase.intent]}`,
          `${room} · ${formatWeekday(procedureCase.scheduledStart)} ${formatTime24(procedureCase.scheduledStart)}`,
          procedureCase.team.surgeon.name,
        ]}
      />

      <SectionCard contentClassName="px-4 pt-4 pb-2">
        <PhaseStepper phase={procedureCase.phase} />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="min-w-0 gap-4">
          <TabsList variant="line" className="h-auto! w-full flex-nowrap justify-start overflow-x-auto overflow-y-hidden border-b border-border pb-px [scrollbar-width:none]" aria-label="Case sections">
            {CASE_TABS.map(({ id, label, icon: Icon, preload }) => (
              <TabsTrigger
                key={id}
                value={id}
                className="flex-none px-2.5"
                data-testid={`case-tab-trigger-${id}`}
                onPointerEnter={preload}
                onFocus={preload}
              >
                <Icon />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          {CASE_TABS.map(({ id, Component }) => (
            <TabsContent key={id} value={id}>
              <TabHint tabId={id} />
              <Component caseId={caseId} />
            </TabsContent>
          ))}
        </Tabs>

        <aside className="space-y-4">
          <GatePanel
            detail={detail}
            onOpenConsent={() => setActiveModal("consent")}
            onOpenPreop={() => setActiveModal("preop")}
            onOpenHpUpdate={() => setActiveModal("hpUpdate")}
            onOpenHpOverride={() => setActiveModal("hpOverride")}
            onOpenFinancial={() => setTab("pre-procedure")}
          />
          <PhaseHistory procedureCase={procedureCase} />
        </aside>
      </div>

      <ConsentModal
        caseId={caseId}
        open={activeModal === "consent"}
        onOpenChange={(open) => setActiveModal(open ? "consent" : null)}
        procedureName={procedureCase.procedureLabel}
        procedureCode={procedureCase.procedure}
        performingPhysicianName={procedureCase.team.surgeon.name}
        patientName={procedureCase.patient.displayName}
        onSuccess={() => void query.refetch()}
      />

      <PreopIntakeDrawer
        caseId={caseId}
        open={activeModal === "preop"}
        onOpenChange={(open) => setActiveModal(open ? "preop" : null)}
        patientName={procedureCase.patient.displayName}
        defaultEscort={detail.patient.escort}
        onSuccess={() => void query.refetch()}
      />

      <HpUpdateModal
        caseId={caseId}
        facilityId="main"
        open={activeModal === "hpUpdate"}
        onOpenChange={(open) => setActiveModal(open ? "hpUpdate" : null)}
        patientName={procedureCase.patient.displayName}
        hpDate={detail.hp?.performedAt ?? detail.hp?.signedAt ?? undefined}
        onSuccess={() => void query.refetch()}
      />

      <HpOverrideModal
        caseId={caseId}
        facilityId="main"
        open={activeModal === "hpOverride"}
        onOpenChange={(open) => setActiveModal(open ? "hpOverride" : null)}
        patientName={procedureCase.patient.displayName}
        onSuccess={() => void query.refetch()}
      />
    </div>
  );
}
