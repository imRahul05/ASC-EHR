"use client";

import { CheckCircle2, Clock, FileEdit, FileText } from "lucide-react";
import {
  Badge,
  Button,
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

export function SurgeonView() {
  const { cases, metrics, isLoading, updateCaseStatus } = useDashboardData();

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Today's Assigned Slate"
          value={`${cases.length} Cases`}
          hint="Endo Suite 1 & 2 • Colonoscopy & EGD"
          isLoading={isLoading}
        />
        <KpiCard
          label="Pending Operative Notes"
          value={`${metrics?.pendingSignatures ?? 0} Awaiting`}
          hint="Attestation & signature required"
          tone="amber"
          isLoading={isLoading}
        />
        <KpiCard
          label="Adenoma Detection Rate"
          value={`${metrics?.adenomaDetectionRate ?? 0}%`}
          hint="Target benchmark: > 25% (Quality Passing)"
          tone="emerald"
          isLoading={isLoading}
        />
        <KpiCard
          label="Cecal Intubation Rate"
          value={`${metrics?.cecalIntubationRate ?? 0}%`}
          hint="Target benchmark: > 95% photo-verified"
          tone="emerald"
          isLoading={isLoading}
        />
      </div>

      {/* Procedure Schedule Table */}
      <Card className="border-border/70 shadow-xs">
        <CardHeader className="p-5 border-b border-border/60 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Today's Endoscopy Slate</CardTitle>
            <CardDescription className="text-xs">
              Direct access to procedure documentation, findings and operative signing
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs font-mono">
            Proceduralist View
          </Badge>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="w-24 px-4 py-3">Time</TableHead>
                <TableHead className="w-28 px-4 py-3">Room</TableHead>
                <TableHead className="px-4 py-3">Patient / MRN</TableHead>
                <TableHead className="px-4 py-3">Procedure</TableHead>
                <TableHead className="px-4 py-3">Status</TableHead>
                <TableHead className="px-4 py-3">Documentation</TableHead>
                <TableHead className="text-right px-4 py-3">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((item) => (
                <TableRow key={item.id} className="text-xs hover:bg-muted/40 transition-colors">
                  <TableCell className="font-medium font-mono px-4 py-3">{item.scheduledTime}</TableCell>
                  <TableCell className="px-4 py-3">
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {item.roomNumber}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="font-semibold text-foreground">{item.patientName}</div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {item.mrn} • DOB: {item.patientDob}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <span className="font-medium text-foreground">{item.procedureTitle}</span>
                    {item.bowelPrepQuality && (
                      <span className="block text-[10px] text-muted-foreground">
                        Prep: {item.bowelPrepQuality}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Badge
                      variant={
                        item.status === "IN_PROCEDURE"
                          ? "default"
                          : item.status === "PACU"
                          ? "secondary"
                          : "outline"
                      }
                      className="text-[10px]"
                    >
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {item.reportSigned ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-500 font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Signed & Locked
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-500 font-medium">
                        <Clock className="h-3.5 w-3.5" />
                        Draft Note
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right px-4 py-3">
                    {!item.reportSigned ? (
                      <Button
                        size="xs"
                        variant="default"
                        className="gap-1 text-xs"
                        onClick={() => void updateCaseStatus({ caseId: item.id, status: "PACU" })}
                      >
                        <FileEdit className="h-3 w-3" />
                        Sign Note
                      </Button>
                    ) : (
                      <Button size="xs" variant="outline" className="gap-1 text-xs">
                        <FileText className="h-3 w-3" />
                        View PDF
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
