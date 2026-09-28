import Link from "next/link";
import { formatTime24 } from "@asc/clinical-rules/time";
import type { ProcedureCase } from "@asc/types";
import { PhaseChip } from "@asc/ui";

interface CaseRowLinkProps {
  readonly procedureCase: ProcedureCase;
  /** Right-hand extra (ASA, flags…). */
  readonly meta?: React.ReactNode;
}

/** One case on a dashboard list: time, room, case #, patient, procedure, phase → opens the case workspace. */
export function CaseRowLink({ procedureCase, meta }: CaseRowLinkProps) {
  return (
    <li>
      <Link
        href={`/cases/${procedureCase.id}`}
        className="flex items-center gap-3 rounded-lg px-2 py-2 outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/40"
        data-testid={`dashboard-case-${procedureCase.id}`}
      >
        <span className="w-12 shrink-0 text-sm font-medium tabular-nums">{formatTime24(procedureCase.scheduledStart)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{procedureCase.patient.displayName}</span>
          <span className="block truncate text-xs text-muted-foreground">
            <span className="font-mono">{procedureCase.caseNumber}</span> · {procedureCase.procedureLabel} · {procedureCase.roomId.replace("room-", "Room ")}
          </span>
        </span>
        {meta}
        <PhaseChip phase={procedureCase.phase} />
      </Link>
    </li>
  );
}
