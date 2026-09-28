"use client";

import type { ReactNode } from "react";
import { useTransitionCase } from "@asc/api-client/react";
import {
  formatTime24,
  procedureEndGate,
  WITHDRAWAL_BENCHMARK_MIN,
  withdrawalMinutes,
} from "@asc/clinical-rules";
import type { CaseDetail, ProcedureEventType } from "@asc/types";
import { Button, cn, ElapsedTime, toast } from "@asc/ui";
import { ArrowRight, CircleCheck, LoaderCircle, Timer, TriangleAlert } from "@asc/ui/icons";
import { notifyError } from "../notify-error";

interface RoomStatusBarProps {
  readonly detail: CaseDetail;
}

function eventAt(detail: CaseDetail, type: ProcedureEventType): string | undefined {
  return detail.events.find((event) => event.type === type)?.at;
}

function Metric({ label, children, hint, testId }: { readonly label: string; readonly children: ReactNode; readonly hint?: ReactNode; readonly testId: string }) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="text-3xl leading-tight font-semibold tracking-tight tabular-nums">{children}</p>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Big-type room header: running procedure timer (scope in → scope out), withdrawal time against the
 * ≥ 6 min benchmark (clinical-rules `withdrawalMinutes`) and "End procedure" (procedureEndGate → RECOVERY).
 */
export function RoomStatusBar({ detail }: RoomStatusBarProps) {
  const transition = useTransitionCase(detail.case.id);
  const inProcedure = detail.case.phase === "IN_PROCEDURE";
  const scopeIn = eventAt(detail, "SCOPE_IN") ?? eventAt(detail, "SEDATION_START");
  const scopeOut = eventAt(detail, "SCOPE_OUT");
  const withdrawalStart = eventAt(detail, "WITHDRAWAL_START") ?? eventAt(detail, "CECUM_REACHED");
  const withdrawal = withdrawalMinutes(detail.events);
  const meetsTarget = withdrawal !== null && withdrawal >= WITHDRAWAL_BENCHMARK_MIN;
  const endGate = procedureEndGate(detail.events);
  const isColon = detail.case.procedure !== "EGD";

  const end = () =>
    transition.mutate(
      { to: "RECOVERY" },
      { onSuccess: () => toast.success("Procedure ended — patient to recovery"), onError: notifyError("Could not end the procedure") },
    );

  return (
    <section
      aria-label="Procedure status"
      data-testid="procedure-status-bar"
      className="grid gap-4 rounded-xl border-2 border-border bg-card p-4 shadow-xs @md:grid-cols-2 @3xl:grid-cols-[1fr_1fr_auto] @3xl:items-center"
    >
      <Metric
        label="Procedure time"
        testId="procedure-timer"
        hint={scopeIn ? `Started ${formatTime24(scopeIn)}${scopeOut ? ` · out ${formatTime24(scopeOut)}` : ""}` : "Starts at scope in"}
      >
        {scopeIn ? <ElapsedTime since={scopeIn} until={scopeOut} label="Procedure time" /> : <span className="text-muted-foreground">0:00</span>}
      </Metric>

      {isColon && (
        <Metric
          label={`Withdrawal · target ≥ ${WITHDRAWAL_BENCHMARK_MIN} min`}
          testId="procedure-withdrawal"
          hint={
            withdrawal !== null ? (
              <span className={cn("inline-flex items-center gap-1 font-medium", meetsTarget ? "text-success" : "text-warning")}>
                {meetsTarget ? <CircleCheck aria-hidden className="size-4" /> : <TriangleAlert aria-hidden className="size-4" />}
                {meetsTarget ? "Meets benchmark" : "Below benchmark"}
              </span>
            ) : withdrawalStart ? (
              "Running since withdrawal start"
            ) : (
              "Starts at cecum / withdrawal"
            )
          }
        >
          {withdrawal !== null ? (
            <span>
              {withdrawal} <span className="text-lg font-medium text-muted-foreground">min</span>
            </span>
          ) : withdrawalStart ? (
            <ElapsedTime since={withdrawalStart} label="Withdrawal time" />
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Metric>
      )}

      {inProcedure ? (
        <div className="space-y-1.5 @md:col-span-2 @3xl:col-span-1">
          <Button
            size="lg"
            className="h-14 w-full px-6 text-base @3xl:w-auto"
            disabled={!endGate.ok || transition.isPending}
            onClick={end}
            data-testid="procedure-end-button"
          >
            {transition.isPending ? <LoaderCircle className="animate-spin" /> : <Timer />}
            End procedure
            <ArrowRight />
          </Button>
          {!endGate.ok && <p className="text-sm text-muted-foreground">{endGate.reasons[0]?.message}</p>}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground @md:col-span-2 @3xl:col-span-1">
          {detail.case.phase === "READY_FOR_PROCEDURE" ? "Complete the time-out to start." : "Procedure complete — room record is read-only."}
        </p>
      )}
    </section>
  );
}
