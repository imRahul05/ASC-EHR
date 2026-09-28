import { ANATOMIC_SITE_LABEL } from "@asc/clinical-rules";
import type { GapChip, NoteFinding, Specimen } from "@asc/types";
import { Badge, DataTable, type DataTableColumn, EmptyState } from "@asc/ui";
import { CircleCheck, FlaskConical, TriangleAlert } from "@asc/ui/icons";

interface FindingsTableProps {
  readonly findings: readonly NoteFinding[];
  readonly specimens: readonly Specimen[];
  readonly gaps: readonly GapChip[];
}

interface Row extends NoteFinding {
  readonly index: number;
  readonly specimen?: Specimen;
  /** A size gap for this finding was resolved in the note text. */
  readonly sizeResolved: boolean;
}

const COLUMNS: readonly DataTableColumn<Row>[] = [
  { id: "n", header: "#", cell: (row) => <span className="tabular-nums text-muted-foreground">{row.index}</span>, className: "w-8" },
  { id: "site", header: "Site", cell: (row) => ANATOMIC_SITE_LABEL[row.site] },
  { id: "description", header: "Finding", cell: (row) => row.description },
  {
    id: "size",
    header: "Size",
    align: "right",
    cell: (row) =>
      row.sizeMm ? (
        <span className="tabular-nums">{row.sizeMm} mm</span>
      ) : row.sizeResolved ? (
        <span className="inline-flex items-center gap-1 text-success">
          <CircleCheck aria-hidden className="size-3.5" /> In note text
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 font-medium text-destructive">
          <TriangleAlert aria-hidden className="size-3.5" /> Missing
        </span>
      ),
  },
  { id: "intervention", header: "Intervention", cell: (row) => <span className="text-muted-foreground">{row.intervention}</span> },
  {
    id: "jar",
    header: "Specimen",
    cell: (row) =>
      row.specimen ? (
        <span className="inline-flex items-center gap-1.5">
          <Badge variant="outline" className="font-semibold">
            <FlaskConical aria-hidden /> Jar {row.specimen.jar}
          </Badge>
          <span className="text-xs text-muted-foreground capitalize">{row.specimen.pathologyStatus}</span>
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

/** Structured findings (polyp → site, size, intervention, specimen jar link). */
export function FindingsTable({ findings, specimens, gaps }: FindingsTableProps) {
  if (findings.length === 0) {
    return <EmptyState title="No findings" description="No polyps or specimens were recorded for this procedure." />;
  }
  const rows: Row[] = findings.map((finding, index) => ({
    ...finding,
    index: index + 1,
    specimen: specimens.find((specimen) => specimen.id === finding.specimenId),
    sizeResolved: gaps.some((chip) => chip.resolved && chip.id === `gap_size_${finding.specimenId ?? ""}`),
  }));
  return <DataTable columns={COLUMNS} rows={rows} getRowId={(row) => row.id} data-testid="note-findings-table" />;
}
