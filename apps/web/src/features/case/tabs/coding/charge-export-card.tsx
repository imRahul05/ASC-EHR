"use client";

import { useState } from "react";
import { ApiError } from "@asc/api-client";
import { useExportCharges } from "@asc/api-client/react";
import { formatDateTime } from "@asc/clinical-rules/time";
import type { CaseCoding, ChargeExport, ChargeLine } from "@asc/types";
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SectionCard,
  SegmentedControl,
  toast,
  type DataTableColumn,
} from "@asc/ui";
import { FileOutput, LoaderCircle } from "@asc/ui/icons";

type ExportFormat = ChargeExport["format"];
type PreviewLine = Omit<ChargeLine, "chargeCents">;

const FORMATS: readonly { readonly value: ExportFormat; readonly label: string }[] = [
  { value: "837P", label: "837P" },
  { value: "837I", label: "837I" },
  { value: "CSV", label: "CSV" },
];
const DX_LETTERS = ["A", "B", "C", "D"] as const;
const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Hand-off rows the billing system will receive: one line per kept CPT, modifiers on professional lines, up to 4 dx pointers. */
function previewLines(coding: CaseCoding): PreviewLine[] {
  const kept = coding.suggestions.filter((item) => item.status === "accepted" || item.status === "edited");
  const modifiers = kept.filter((item) => item.system === "MOD").map((item) => item.code);
  const diagnoses = kept.filter((item) => item.system === "ICD10").map((item) => item.code).slice(0, DX_LETTERS.length);
  return kept
    .filter((item) => item.system === "CPT")
    .map((item) => ({ code: item.code, modifiers: item.line === "professional" ? modifiers : [], diagnosisPointers: diagnoses, units: item.line === "anesthesia" ? 4 : 1, line: item.line }));
}

const pointerText = (codes: readonly string[]) => codes.map((code, index) => `${DX_LETTERS[index] ?? "?"}=${code}`).join(" ") || "—";

const LINE_COLUMNS: readonly DataTableColumn<PreviewLine & { readonly n: number; readonly chargeCents?: number }>[] = [
  { id: "n", header: "Ln", cell: (row) => <span className="tabular-nums">{row.n}</span> },
  { id: "code", header: "CPT/HCPCS", cell: (row) => <span className="font-mono">{row.code}</span> },
  { id: "mod", header: "Mod", cell: (row) => <span className="font-mono">{row.modifiers.join(" ") || "—"}</span> },
  { id: "dx", header: "Dx pointers", className: "whitespace-normal", cell: (row) => <span className="font-mono text-xs">{pointerText(row.diagnosisPointers)}</span> },
  { id: "units", header: "Units", align: "right", cell: (row) => <span className="tabular-nums">{row.units}</span> },
  { id: "line", header: "Type", cell: (row) => <span className="capitalize text-muted-foreground">{row.line}</span> },
  { id: "charge", header: "Charge", align: "right", cell: (row) => <span className="tabular-nums">{row.chargeCents === undefined ? "on export" : USD.format(row.chargeCents / 100)}</span> },
];

interface ChargeExportCardProps {
  readonly coding: CaseCoding;
  readonly patientName: string;
  readonly caseNumber: string;
}

/** Charge hand-off: preview the 837-like rows, pick a format, confirm, export (case → Exported). */
export function ChargeExportCard({ coding, patientName, caseNumber }: ChargeExportCardProps) {
  const [format, setFormat] = useState<ExportFormat>("837P");
  const [confirming, setConfirming] = useState(false);
  const exportCharges = useExportCharges(coding.caseId);
  const exported = coding.export;
  const rows = (exported ? exported.lines : previewLines(coding)).map((line, index) => ({ ...line, n: index + 1 }));
  const canExport = coding.status === "attested";

  const onExport = () =>
    exportCharges.mutate(
      { format },
      {
        onSuccess: (result) => {
          setConfirming(false);
          toast.success(`${result.format} batch ${result.batchId} sent`);
        },
        onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not export charges"),
      },
    );

  return (
    <SectionCard
      title="Charge export"
      description={exported ? `Batch ${exported.batchId} · ${formatDateTime(exported.createdAt)}` : "Preview of the billing hand-off (claim lines, no free text)."}
      actions={exported ? <Badge variant="outline" className="border-success/30 text-success">{exported.format} {exported.status}</Badge> : undefined}
      footer={
        exported ? (
          <p className="mr-auto text-sm">
            Total <span className="font-semibold tabular-nums">{USD.format(exported.totalCents / 100)}</span>
          </p>
        ) : (
          <>
            <SegmentedControl aria-label="Export format" size="sm" className="mr-auto w-auto" options={FORMATS} value={format} onValueChange={setFormat} data-testid="coding-export-format" />
            <Button onClick={() => setConfirming(true)} disabled={!canExport || rows.length === 0 || exportCharges.isPending} data-testid="coding-export-button">
              <FileOutput />
              Export charges
            </Button>
          </>
        )
      }
      data-testid="coding-export"
    >
      {!exported && !canExport && <p className="mb-3 text-xs text-muted-foreground">Export unlocks after coder attestation.</p>}
      <DataTable
        columns={LINE_COLUMNS}
        rows={rows}
        getRowId={(row) => `${row.n}-${row.code}`}
        empty={<p className="text-center text-sm text-muted-foreground">Accept at least one CPT code to build a claim line.</p>}
        data-testid="coding-export-lines"
      />
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export charges for {patientName}?</DialogTitle>
            <DialogDescription>
              {patientName} · {caseNumber}: send {rows.length} claim line(s) as {format} to billing. Exported charges cannot be recalled from here.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Not yet</DialogClose>
            <Button onClick={onExport} disabled={exportCharges.isPending} data-testid="coding-export-confirm">
              {exportCharges.isPending ? <LoaderCircle className="animate-spin" /> : <FileOutput />}
              Export {format}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
