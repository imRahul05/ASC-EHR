"use client";

import { History, DollarSign } from "lucide-react";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@asc/ui";
import { useDashboardData } from "../../../hooks/use-dashboard-data";
import { KpiCard } from "../kpi-card";

export function AdminView() {
  const { metrics, auditLogs, cases, isLoading } = useDashboardData();

  return (
    <div className="space-y-6">
      {/* Executive Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="OR Volume Today"
          value={`${metrics?.totalCasesToday ?? 0} Cases`}
          hint="Endo 1: 10 cases • Endo 2: 8 cases"
          isLoading={isLoading}
        />
        <KpiCard
          label="Turnaround Time"
          value={`${metrics?.averageTurnaroundMinutes ?? 0} min`}
          hint="Target: < 15 min between scopes"
          tone="emerald"
          isLoading={isLoading}
        />
        <KpiCard
          label="Unbilled Hand-Off Queue"
          value={`${metrics?.unbilledCasesCount ?? 0} Cases`}
          hint="CPT/ICD-10 charge export pending"
          tone="amber"
          isLoading={isLoading}
        />
        <KpiCard
          label="Block Utilization"
          value="89.4%"
          hint="Surgeon blocks on schedule"
          isLoading={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Billing Hand-Off Status */}
        <Card className="border-border/70 shadow-xs">
          <CardHeader className="p-4 pb-3 border-b border-border/60">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Biller Charge Export Queue
            </CardTitle>
            <CardDescription className="text-xs">
              Clean procedure charge files prepared for external billing hand-off
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>MRN</TableHead>
                  <TableHead>Procedure</TableHead>
                  <TableHead>Coding Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.slice(0, 4).map((c) => (
                  <TableRow key={c.id} className="text-xs">
                    <TableCell className="font-mono">{c.mrn}</TableCell>
                    <TableCell className="font-medium">{c.procedureTitle}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {c.reportSigned ? "Ready for Export" : "Waiting Signature"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Real-time Audit Log */}
        <Card className="border-border/70 shadow-xs">
          <CardHeader className="p-4 pb-3 border-b border-border/60">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <History className="h-4 w-4" />
              HIPAA Audit & Clinical Event Stream
            </CardTitle>
            <CardDescription className="text-xs">
              Immutable audit events logged via @asc/audit
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {auditLogs.map((log) => (
              <div key={log.id} className="text-xs flex items-start gap-2.5 pb-2 border-b border-border/40 last:border-0 last:pb-0">
                <span className="font-mono text-[10px] text-muted-foreground shrink-0 mt-0.5">
                  {log.timestamp}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-foreground block">{log.actor}</span>
                  <span className="text-muted-foreground">{log.action}</span>
                </div>
                <Badge variant="secondary" className="text-[9px] font-mono shrink-0">
                  {log.patientMrn}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
