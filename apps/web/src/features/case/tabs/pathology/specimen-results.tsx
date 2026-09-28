"use client";

import { useState } from "react";
import { ApiError } from "@asc/api-client";
import { useReconcilePathology } from "@asc/api-client/react";
import { formatDateTime } from "@asc/clinical-rules/time";
import type { CasePathology, NoteFinding, PathologyResult, Specimen } from "@asc/types";
import { Badge, Button, DataTable, toast, type DataTableColumn } from "@asc/ui";
import { FlaskConical, Link2, TriangleAlert } from "@asc/ui/icons";
import { DYSPLASIA_LABEL, HISTOLOGY_LABEL, SPECIMEN_STATUS, siteLabel } from "./pathology-labels";
import { RecordResultDialog } from "./record-result-dialog";

interface Row {
  readonly specimen: Specimen;
  readonly index: number;
  readonly result: PathologyResult | undefined;
  readonly finding: NoteFinding | undefined;
}

interface SpecimenResultsProps {
  readonly caseId: string;
  readonly pathology: CasePathology;
  readonly findings: readonly NoteFinding[];
  readonly editable: boolean;
}

/** Specimens with result status: simulate arrival → review histology / adenoma flag → reconcile to the note finding. */
export function SpecimenResults({ caseId, pathology, findings, editable }: SpecimenResultsProps) {
  const [recording, setRecording] = useState<Row | null>(null);
  const reconcile = useReconcilePathology(caseId);
  const rows: Row[] = pathology.specimens.map((specimen, index) => ({
    specimen,
    index,
    result: pathology.results.find((result) => result.specimenId === specimen.id),
    finding: findings.find((finding) => finding.specimenId === specimen.id),
  }));

  const onReconcile = (row: Row) =>
    row.result &&
    reconcile.mutate(
      { resultId: row.result.id, ...(row.finding ? { findingId: row.finding.id } : {}) },
      {
        onSuccess: () => toast.success(`Jar ${row.specimen.jar} reconciled`),
        onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not reconcile"),
      },
    );

  const columns: readonly DataTableColumn<Row>[] = [
    { id: "jar", header: "Jar", cell: (row) => <span className="font-mono font-medium">{row.specimen.jar}</span> },
    {
      id: "specimen",
      header: "Specimen",
      className: "min-w-44 whitespace-normal",
      cell: (row) => (
        <div>
          <p className="text-sm capitalize">{siteLabel(row.specimen.site)}</p>
          <p className="text-xs text-muted-foreground">
            {row.specimen.description}
            {row.specimen.sizeMm ? ` · ${row.specimen.sizeMm} mm` : ""}
          </p>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => (
        <Badge variant="outline" className={SPECIMEN_STATUS[row.specimen.pathologyStatus].className}>
          {SPECIMEN_STATUS[row.specimen.pathologyStatus].label}
        </Badge>
      ),
    },
    {
      id: "result",
      header: "Result",
      className: "min-w-52 whitespace-normal",
      cell: (row) =>
        row.result ? (
          <div className="space-y-1">
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
              {HISTOLOGY_LABEL[row.result.histology]}
              {row.result.isAdenoma && (
                <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning" data-testid={`pathology-adenoma-${row.specimen.jar}`}>
                  <TriangleAlert /> Adenoma
                </Badge>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {DYSPLASIA_LABEL[row.result.dysplasia]} · received {formatDateTime(row.result.receivedAt)}
            </p>
            {row.finding && <p className="text-xs text-muted-foreground">Note finding: {row.finding.description}</p>}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
    {
      id: "action",
      header: "",
      align: "right",
      cell: (row) => {
        if (!editable) return null;
        if (!row.result) {
          return (
            <Button size="sm" variant="outline" onClick={() => setRecording(row)} data-testid={`pathology-simulate-${row.specimen.jar}`}>
              <FlaskConical /> Simulate result arrival
            </Button>
          );
        }
        return row.result.status === "received" ? (
          <Button size="sm" onClick={() => onReconcile(row)} disabled={reconcile.isPending} data-testid={`pathology-reconcile-${row.specimen.jar}`}>
            <Link2 /> Reconcile to polyp
          </Button>
        ) : null;
      },
    },
  ];

  return (
    <>
      <DataTable columns={columns} rows={rows} getRowId={(row) => row.specimen.id} data-testid="pathology-specimens" />
      <RecordResultDialog caseId={caseId} specimen={recording?.specimen ?? null} index={recording?.index ?? 0} onClose={() => setRecording(null)} />
    </>
  );
}
