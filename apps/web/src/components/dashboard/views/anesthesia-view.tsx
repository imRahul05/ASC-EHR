"use client";

import { ShieldAlert, CheckCircle2, AlertTriangle, Activity } from "lucide-react";
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

export function AnesthesiaView() {
  const { cases, updateCaseStatus } = useDashboardData();

  return (
    <div className="space-y-6">
      {/* Airway & Sedation Alert Banner */}
      <Card className="border-border/70 bg-card/60 shadow-xs">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                Anesthesia Care & Airway Clearance Worklist
              </h4>
              <p className="text-xs text-muted-foreground">
                All cases require ASA physical status, Mallampati airway classification, and NPO attestation prior to sedation.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="font-mono text-xs shrink-0 self-start sm:self-auto">
            Propofol / MAC Protocol
          </Badge>
        </CardContent>
      </Card>

      {/* Anesthesia Worklist Table */}
      <Card className="border-border/70 shadow-xs">
        <CardHeader className="p-5 border-b border-border/60 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Sedation & Airway Evaluation Queue</CardTitle>
            <CardDescription className="text-xs">
              Pre-evaluations, intra-procedure monitoring and PACU recovery status
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs font-mono">
            Anesthesia Provider
          </Badge>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="w-24">Time</TableHead>
                <TableHead className="w-28">Room</TableHead>
                <TableHead>Patient / MRN</TableHead>
                <TableHead>ASA Status</TableHead>
                <TableHead>Mallampati</TableHead>
                <TableHead>NPO Status</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((item) => (
                <TableRow key={item.id} className="text-xs">
                  <TableCell className="font-mono font-medium">{item.scheduledTime}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {item.roomNumber}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-foreground">{item.patientName}</div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {item.mrn} • {item.procedureType}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {item.asaScore ?? "ASA_II"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono font-medium">Class {item.mallampatiScore ?? 2}</span>
                  </TableCell>
                  <TableCell>
                    {item.npoConfirmed ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-500 font-medium">
                        <CheckCircle2 className="h-3 w-3" />
                        NPO &gt; 8h
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-destructive font-medium">
                        <AlertTriangle className="h-3 w-3" />
                        Pending NPO
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={item.status === "IN_PROCEDURE" ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="xs"
                      variant="outline"
                      className="gap-1 text-xs"
                      onClick={() => void updateCaseStatus({ caseId: item.id, status: "IN_PROCEDURE" })}
                    >
                      <Activity className="h-3 w-3" />
                      Clear Sedation
                    </Button>
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
