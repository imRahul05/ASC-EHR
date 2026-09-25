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

export function SurgeonView() {
  const { cases, metrics, updateCaseStatus } = useDashboardData();

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/70 shadow-xs">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">Today's Assigned Slate</CardDescription>
            <CardTitle className="text-2xl font-bold tracking-tight">{cases.length} Cases</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground">
            Endo Suite 1 & 2 • Colonoscopy & EGD
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-xs">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">Pending Operative Notes</CardDescription>
            <CardTitle className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-500">
              {metrics?.pendingSignatures ?? 3} Awaiting
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground">
            Attestation & signature required
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-xs">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">Adenoma Detection Rate</CardDescription>
            <CardTitle className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-500">
              {metrics?.adenomaDetectionRate ?? 38.6}%
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground">
            Target benchmark: &gt; 25% (Quality Passing)
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-xs">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">Cecal Intubation Rate</CardDescription>
            <CardTitle className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-500">
              {metrics?.cecalIntubationRate ?? 98.4}%
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground">
            Target benchmark: &gt; 95% photo-verified
          </CardContent>
        </Card>
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
                <TableHead className="w-24">Time</TableHead>
                <TableHead className="w-28">Room</TableHead>
                <TableHead>Patient / MRN</TableHead>
                <TableHead>Procedure</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Documentation</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((item) => (
                <TableRow key={item.id} className="text-xs">
                  <TableCell className="font-medium font-mono">{item.scheduledTime}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {item.roomNumber}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-foreground">{item.patientName}</div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {item.mrn} • DOB: {item.patientDob}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium text-foreground">{item.procedureTitle}</span>
                    {item.bowelPrepQuality && (
                      <span className="block text-[10px] text-muted-foreground">
                        Prep: {item.bowelPrepQuality}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
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
                  <TableCell>
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
                  <TableCell className="text-right">
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
