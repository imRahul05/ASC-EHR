"use client";

import { ArrowRight } from "lucide-react";
import { Badge, Button, Card, CardContent } from "@asc/ui";
import type { CaseStatus, GICase } from "@asc/types";
import { useDashboardData } from "../../../hooks/use-dashboard-data";

const STAGES: readonly { status: CaseStatus; label: string; color: string }[] = [
  { status: "CHECKED_IN", label: "Check-In / Waiting", color: "bg-zinc-500/10 text-zinc-500" },
  { status: "PRE_OP", label: "Pre-Op Prep & IV", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  { status: "IN_PROCEDURE", label: "In Procedure Suite", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { status: "PACU", label: "PACU Recovery", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  { status: "DISCHARGED", label: "Discharged Home", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
];

export function NurseView() {
  const { cases, updateCaseStatus } = useDashboardData();

  const getCasesForStage = (status: CaseStatus): readonly GICase[] => {
    return cases.filter((c) => c.status === status);
  };

  const getNextStage = (current: CaseStatus): CaseStatus => {
    switch (current) {
      case "CHECKED_IN":
        return "PRE_OP";
      case "PRE_OP":
        return "IN_PROCEDURE";
      case "IN_PROCEDURE":
        return "PACU";
      case "PACU":
        return "DISCHARGED";
      default:
        return "DISCHARGED";
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold tracking-tight text-foreground">
            ASC Digital Whiteboard & Flow Coordinator
          </h3>
          <p className="text-xs text-muted-foreground">
            Live patient tracker across endoscopy suites, pre-op bays and PACU recovery.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs font-mono">
            Circulator / PACU RN Active
          </Badge>
        </div>
      </div>

      {/* Kanban / Pipeline Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {STAGES.map((stage) => {
          const stageCases = getCasesForStage(stage.status);
          return (
            <div key={stage.status} className="flex flex-col space-y-2">
              <div className="flex items-center justify-between px-2 py-1 rounded bg-muted/50 border border-border/60">
                <span className="text-xs font-semibold text-foreground truncate">{stage.label}</span>
                <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 h-4">
                  {stageCases.length}
                </Badge>
              </div>

              <div className="space-y-2 min-h-[300px]">
                {stageCases.length === 0 ? (
                  <div className="h-28 border border-dashed border-border/70 rounded-lg flex items-center justify-center text-[11px] text-muted-foreground">
                    No patients
                  </div>
                ) : (
                  stageCases.map((item) => (
                    <Card key={item.id} className="border-border/80 shadow-xs bg-card hover:border-foreground/30 transition-all">
                      <CardContent className="p-3 space-y-2.5">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-xs font-bold text-foreground block">
                              {item.patientName}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {item.mrn} • {item.roomNumber}
                            </span>
                          </div>
                          <Badge variant="outline" className="text-[9px] font-mono">
                            {item.scheduledTime}
                          </Badge>
                        </div>

                        <div className="text-[11px] text-muted-foreground space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span>Time-Out:</span>
                            <span className={item.timeOutCompleted ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>
                              {item.timeOutCompleted ? "Verified ✓" : "Pending"}
                            </span>
                          </div>
                          {item.aldreteScore !== undefined && (
                            <div className="flex items-center justify-between text-[10px]">
                              <span>Aldrete Score:</span>
                              <span className="font-mono font-bold text-foreground">
                                {item.aldreteScore} / 10
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-[10px]">
                            <span>Escort:</span>
                            <span className={item.escortConfirmed ? "text-emerald-600 font-medium" : "text-destructive font-medium"}>
                              {item.escortConfirmed ? "Confirmed ✓" : "Required"}
                            </span>
                          </div>
                        </div>

                        {stage.status !== "DISCHARGED" && (
                          <Button
                            size="xs"
                            variant="secondary"
                            className="w-full text-[11px] h-7 gap-1 mt-1 justify-between"
                            onClick={() =>
                              void updateCaseStatus({
                                caseId: item.id,
                                status: getNextStage(item.status),
                              })
                            }
                          >
                            <span>Advance Stage</span>
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
