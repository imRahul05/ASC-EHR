import type { ReactNode } from "react"
import { cn } from "../../lib/utils"
import { Skeleton } from "../ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"

export interface DataTableColumn<TRow> {
  readonly id: string
  readonly header: ReactNode
  readonly cell: (row: TRow) => ReactNode
  readonly align?: "left" | "right" | "center"
  readonly className?: string
}

export interface DataTableProps<TRow> {
  readonly columns: readonly DataTableColumn<TRow>[]
  readonly rows: readonly TRow[]
  readonly getRowId: (row: TRow) => string
  readonly onRowClick?: (row: TRow) => void
  readonly isLoading?: boolean
  /** Rendered in place of the body when there are no rows. */
  readonly empty?: ReactNode
  readonly className?: string
  readonly "data-testid"?: string
}

const ALIGN_CLASS = { left: "text-left", right: "text-right", center: "text-center" } as const
const SKELETON_ROWS = 5

/** Config-driven table: columns are data (`{ id, header, cell }`), rows render with `.map()`. */
export function DataTable<TRow>({
  columns,
  rows,
  getRowId,
  onRowClick,
  isLoading = false,
  empty,
  className,
  "data-testid": testId,
}: DataTableProps<TRow>) {
  return (
    <div data-testid={testId} className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead key={column.id} className={cn("h-9 text-xs font-medium text-muted-foreground", ALIGN_CLASS[column.align ?? "left"], column.className)}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading &&
            Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <TableRow key={index}>
                {columns.map((column) => (
                  <TableCell key={column.id}>
                    <Skeleton className="h-4 w-full max-w-40" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          {!isLoading && rows.length === 0 && empty && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="p-4">
                {empty}
              </TableCell>
            </TableRow>
          )}
          {!isLoading &&
            rows.map((row) => (
              <TableRow
                key={getRowId(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (event) => (event.key === "Enter" ? onRowClick(row) : undefined) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={cn(onRowClick && "cursor-pointer outline-none focus-visible:bg-accent")}
              >
                {columns.map((column) => (
                  <TableCell key={column.id} className={cn("text-sm", ALIGN_CLASS[column.align ?? "left"], column.className)}>
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  )
}
